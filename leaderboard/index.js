const { TableClient } = require("@azure/data-tables");

const CONN = () => process.env.STORAGE_CONNECTION_STRING;

async function getClient(table) {
  return TableClient.fromConnectionString(CONN(), table);
}

module.exports = async function(context, req) {
  const method = req.method.toUpperCase();
  const action = req.query.action;

  try {
    if (method === "GET" && action === "history") {
      // Get game history - last 50 games
      const client = await getClient("games");
      const games = [];
      const iter = client.listEntities({
        queryOptions: { filter: `PartitionKey eq 'game'` }
      });
      for await (const e of iter) {
        games.push({
          id: e.rowKey,
          date: e.date,
          rounds: e.rounds,
          host: e.host,
          players: JSON.parse(e.players || '[]'),
          standings: JSON.parse(e.standings || '[]'),
          thirtyOnes: JSON.parse(e.thirtyOnes || '[]'),
          complete: e.complete
        });
      }
      games.sort((a, b) => new Date(b.date) - new Date(a.date));
      context.res = {
        status: 200,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(games.slice(0, 50))
      };

    } else if (method === "GET" && action === "top10") {
      // Get top 10 players
      const client = await getClient("players");
      const players = [];
      const iter = client.listEntities({
        queryOptions: { filter: `PartitionKey eq 'player'` }
      });
      for await (const e of iter) {
        players.push({
          name: e.rowKey,
          wins: e.wins || 0,
          losses: e.losses || 0,
          games: e.games || 0,
          thirtyOnes: e.thirtyOnes || 0,
          chipsLost: e.chipsLost || 0,
          currentStreak: e.currentStreak || 0,
          bestStreak: e.bestStreak || 0,
          winPct: e.games > 0 ? Math.round((e.wins / e.games) * 100) : 0
        });
      }
      players.sort((a, b) => b.wins - a.wins || b.winPct - a.winPct);
      context.res = {
        status: 200,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(players.slice(0, 10))
      };

    } else if (method === "POST" && action === "elimination") {
      // Record a player elimination during the game
      const { gameId, playerName, place, chipsLost, had31, round } = req.body;
      const pClient = await getClient("players");

      // Update or create player record
      let playerEntity;
      try {
        playerEntity = await pClient.getEntity("player", playerName);
      } catch(e) {
        playerEntity = {
          partitionKey: "player",
          rowKey: playerName,
          wins: 0, losses: 0, games: 0,
          thirtyOnes: 0, chipsLost: 0,
          currentStreak: 0, bestStreak: 0
        };
      }

      playerEntity.losses = (playerEntity.losses || 0) + 1;
      playerEntity.games = (playerEntity.games || 0) + 1;
      playerEntity.chipsLost = (playerEntity.chipsLost || 0) + (chipsLost || 0);
      if (had31) playerEntity.thirtyOnes = (playerEntity.thirtyOnes || 0) + 1;
      playerEntity.currentStreak = 0; // reset streak on loss

      await pClient.upsertEntity(playerEntity, "Replace");

      context.res = {
        status: 200,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ok: true })
      };

    } else if (method === "POST" && action === "game-start") {
      // Create game record when game starts
      const { gameId, players, host, date } = req.body;
      const gClient = await getClient("games");

      await gClient.upsertEntity({
        partitionKey: "game",
        rowKey: gameId,
        date: date || new Date().toISOString(),
        host: host,
        players: JSON.stringify(players),
        standings: JSON.stringify([]),
        thirtyOnes: JSON.stringify([]),
        rounds: 0,
        complete: false
      }, "Replace");

      context.res = {
        status: 200,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gameId })
      };

    } else if (method === "POST" && action === "round-end") {
      // Update round count and 31s after each round
      const { gameId, round, thirtyOneBy } = req.body;
      const gClient = await getClient("games");

      let game;
      try {
        game = await gClient.getEntity("game", gameId);
      } catch(e) {
        context.res = { status: 404, body: JSON.stringify({ error: "Game not found" }) };
        return;
      }

      const thirtyOnes = JSON.parse(game.thirtyOnes || '[]');
      if (thirtyOneBy) thirtyOnes.push({ round, player: thirtyOneBy });

      await gClient.upsertEntity({
        ...game,
        rounds: round,
        thirtyOnes: JSON.stringify(thirtyOnes)
      }, "Replace");

      context.res = {
        status: 200,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ok: true })
      };

    } else if (method === "POST" && action === "game-end") {
      // Finalize game — record winner, update standings, update player win record
      const { gameId, standings, round } = req.body;
      const gClient = await getClient("games");
      const pClient = await getClient("players");

      // Update game record
      let game;
      try {
        game = await gClient.getEntity("game", gameId);
      } catch(e) {
        context.res = { status: 404, body: JSON.stringify({ error: "Game not found" }) };
        return;
      }

      await gClient.upsertEntity({
        ...game,
        standings: JSON.stringify(standings),
        rounds: round,
        complete: true
      }, "Replace");

      // Update winner's player record
      if (standings.length > 0) {
        const winner = standings[0];
        let playerEntity;
        try {
          playerEntity = await pClient.getEntity("player", winner.name);
        } catch(e) {
          playerEntity = {
            partitionKey: "player",
            rowKey: winner.name,
            wins: 0, losses: 0, games: 0,
            thirtyOnes: 0, chipsLost: 0,
            currentStreak: 0, bestStreak: 0
          };
        }

        playerEntity.wins = (playerEntity.wins || 0) + 1;
        // Note: games count already incremented at elimination for losers
        // Winner's games count needs incrementing here
        playerEntity.games = (playerEntity.games || 0) + 1;
        playerEntity.currentStreak = (playerEntity.currentStreak || 0) + 1;
        if (playerEntity.currentStreak > (playerEntity.bestStreak || 0)) {
          playerEntity.bestStreak = playerEntity.currentStreak;
        }

        await pClient.upsertEntity(playerEntity, "Replace");
      }

      context.res = {
        status: 200,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ok: true })
      };

    } else {
      context.res = {
        status: 400,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "Unknown action" })
      };
    }

  } catch(e) {
    context.res = {
      status: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: e.message })
    };
  }
};
