const { TableClient } = require("@azure/data-tables");

async function getClient() {
  return TableClient.fromConnectionString(
    process.env.STORAGE_CONNECTION_STRING,
    "gamestate"
  );
}

module.exports = async function(context, req) {
  const method = req.method.toUpperCase();

  try {
    const client = await getClient();

    if (method === "GET") {
      const gameCode = req.query.gameCode;
      if (!gameCode) {
        context.res = { status: 400, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ error: "gameCode required" }) };
        return;
      }
      try {
        const entity = await client.getEntity("game", gameCode);
        context.res = {
          status: 200,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            gameCode: entity.rowKey,
            hostName: entity.hostName,
            gameId: entity.gameId,
            round: entity.round,
            phase: entity.phase,
            currentIdx: entity.currentIdx,
            knockedBy: entity.knockedBy || null,
            deckCount: entity.deckCount,
            players: JSON.parse(entity.players || '[]'),
            discard: JSON.parse(entity.discard || '[]'),
            deck: JSON.parse(entity.deck || '[]'),
            hands: JSON.parse(entity.hands || '{}'),
            gameStarted: entity.gameStarted,
            lastUpdated: entity.lastUpdated
          })
        };
      } catch(e) {
        context.res = { status: 404, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ error: "Game not found" }) };
      }

    } else if (method === "POST") {
      const body = req.body;
      if (!body.gameCode) {
        context.res = { status: 400, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ error: "gameCode required" }) };
        return;
      }

      await client.upsertEntity({
        partitionKey: "game",
        rowKey: body.gameCode,
        hostName: body.hostName || "",
        gameId: body.gameId || "",
        round: body.round || 1,
        phase: body.phase || "draw",
        currentIdx: body.currentIdx || 0,
        knockedBy: body.knockedBy || "",
        deckCount: body.deckCount || 0,
        players: JSON.stringify(body.players || []),
        discard: JSON.stringify(body.discard || []),
        deck: JSON.stringify(body.deck || []),
        hands: JSON.stringify(body.hands || {}),
        gameStarted: body.gameStarted || false,
        lastUpdated: new Date().toISOString()
      }, "Replace");

      context.res = {
        status: 200,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ok: true })
      };

    } else if (method === "DELETE") {
      const gameCode = req.query.gameCode;
      if (!gameCode) {
        context.res = { status: 400, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ error: "gameCode required" }) };
        return;
      }
      try {
        await client.deleteEntity("game", gameCode);
      } catch(e) {}
      context.res = {
        status: 200,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ok: true })
      };

    } else {
      context.res = { status: 405, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ error: "Method not allowed" }) };
    }

  } catch(e) {
    context.res = {
      status: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: e.message })
    };
  }
};
