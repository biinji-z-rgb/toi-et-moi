const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

const ALL_ITEMS = JSON.parse(fs.readFileSync(path.join(__dirname, 'questions.json'), 'utf8'));

app.use(express.static(path.join(__dirname, 'public')));

// ---- Etat en memoire des sessions ----
// sessions[code] = {
//   code, location, players: [{id,name}], sockets: [socketId,...],
//   deck: [...items], currentIndex, answers: {itemIndex: {socketId: answer}},
//   confirmed: {itemIndex: Set(socketId)}, started: bool
// }
const sessions = {};

function generateCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code;
  do {
    code = Array.from({ length: 5 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  } while (sessions[code]);
  return code;
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const LEVEL_ORDER = { light: 0, medium: 1, hot: 2, 'very-hot': 3, 'ultra-hot': 4 };

function buildDeck(locationContext) {
  // locationContext "home" -> défis "duo" (à faire ensemble, tous deux présents)
  // locationContext "away" -> défis "solo" (chacun seul de son côté, preuve envoyée à l'autre)
  const allowedChallengeMode = locationContext === 'home' ? 'duo' : 'solo';

  // Les questions ne dependent pas du lieu : toujours disponibles
  const questions = shuffle(ALL_ITEMS.filter((it) => it.type === 'question'));
  const challenges = shuffle(
    ALL_ITEMS.filter((it) => it.type === 'challenge' && it.mode === allowedChallengeMode)
  );

  const MIN_CHALLENGES = 3;
  const TOTAL = 15;

  const chosenChallenges = challenges.slice(0, MIN_CHALLENGES);
  const remainingSlots = TOTAL - chosenChallenges.length;

  // On complete avec un melange de questions + eventuellement quelques defis en plus
  const rest = shuffle([...questions, ...challenges.slice(MIN_CHALLENGES)]).slice(0, remainingSlots);

  let deck = shuffle([...chosenChallenges, ...rest]);

  // On trie par intensite croissante pour une montée progressive, en gardant un peu d'aleatoire au sein de chaque palier
  deck.sort((a, b) => LEVEL_ORDER[a.level] - LEVEL_ORDER[b.level]);

  return deck;
}

io.on('connection', (socket) => {
  socket.on('createSession', ({ name, location }) => {
    const code = generateCode();
    sessions[code] = {
      code,
      location: location === 'home' ? 'home' : 'away',
      players: [{ id: socket.id, name: (name || 'Joueur 1').trim().slice(0, 30) }],
      sockets: [socket.id],
      deck: [],
      currentIndex: 0,
      answers: {},
      confirmed: {},
      started: false,
    };
    socket.join(code);
    socket.data.code = code;
    socket.emit('sessionCreated', { code, players: sessions[code].players });
  });

  socket.on('joinSession', ({ name, code }) => {
    code = (code || '').toUpperCase().trim();
    const session = sessions[code];
    if (!session) {
      socket.emit('errorMessage', { message: "Ce code de session n'existe pas ou a expiré." });
      return;
    }
    if (session.sockets.length >= 2) {
      socket.emit('errorMessage', { message: 'Cette session est déjà complète (2 joueurs max).' });
      return;
    }
    session.players.push({ id: socket.id, name: (name || 'Joueur 2').trim().slice(0, 30) });
    session.sockets.push(socket.id);
    socket.join(code);
    socket.data.code = code;

    io.to(code).emit('playersUpdated', { players: session.players });
    socket.emit('sessionJoined', { code, players: session.players, location: session.location });
  });

  socket.on('startGame', () => {
    const code = socket.data.code;
    const session = sessions[code];
    if (!session || session.sockets.length < 2) {
      socket.emit('errorMessage', { message: 'Il faut être deux pour commencer la partie.' });
      return;
    }
    session.deck = buildDeck(session.location);
    session.currentIndex = 0;
    session.answers = {};
    session.confirmed = {};
    session.started = true;

    io.to(code).emit('gameStarted', {
      totalQuestions: session.deck.length,
    });
    sendCurrentItem(code);
  });

  socket.on('submitAnswer', ({ answer }) => {
    const code = socket.data.code;
    const session = sessions[code];
    if (!session || !session.started) return;

    const idx = session.currentIndex;
    if (!session.answers[idx]) session.answers[idx] = {};
    session.answers[idx][socket.id] = answer;

    const bothAnswered = session.sockets.every((sid) => session.answers[idx] && session.answers[idx][sid] !== undefined);

    const player = session.players.find((p) => p.id === socket.id);
    socket.to(code).emit('partnerAnswered', { name: player ? player.name : 'Ton/ta partenaire' });

    if (bothAnswered) {
      const payload = session.sockets.map((sid) => {
        const p = session.players.find((pl) => pl.id === sid);
        return { name: p ? p.name : 'Joueur', answer: session.answers[idx][sid] };
      });
      io.to(code).emit('revealAnswers', { index: idx, answers: payload });
    }
  });

  socket.on('challengeDone', () => {
    const code = socket.data.code;
    const session = sessions[code];
    if (!session || !session.started) return;

    const idx = session.currentIndex;
    if (!session.confirmed[idx]) session.confirmed[idx] = new Set();
    session.confirmed[idx].add(socket.id);

    const bothConfirmed = session.sockets.every((sid) => session.confirmed[idx] && session.confirmed[idx].has(sid));

    const player = session.players.find((p) => p.id === socket.id);
    socket.to(code).emit('partnerConfirmedChallenge', { name: player ? player.name : 'Ton/ta partenaire' });

    if (bothConfirmed) {
      io.to(code).emit('challengeCompleted', { index: idx });
    }
  });

  socket.on('nextQuestion', () => {
    const code = socket.data.code;
    const session = sessions[code];
    if (!session || !session.started) return;

    session.currentIndex += 1;

    if (session.currentIndex >= session.deck.length) {
      const summary = session.deck.map((item, idx) => ({
        item,
        answers: session.answers[idx]
          ? session.sockets.map((sid) => {
              const p = session.players.find((pl) => pl.id === sid);
              return { name: p ? p.name : 'Joueur', answer: session.answers[idx][sid] };
            })
          : null,
      }));
      io.to(code).emit('gameFinished', { summary });
      session.started = false;
      return;
    }

    sendCurrentItem(code);
  });

  socket.on('disconnect', () => {
    const code = socket.data.code;
    const session = sessions[code];
    if (!session) return;
    io.to(code).emit('partnerLeft');
    delete sessions[code];
  });
});

function sendCurrentItem(code) {
  const session = sessions[code];
  const item = session.deck[session.currentIndex];
  io.to(code).emit('newItem', {
    index: session.currentIndex,
    total: session.deck.length,
    item,
  });
}

server.listen(PORT, () => {
  console.log(`Duo Intime lancé sur le port ${PORT}`);
});
