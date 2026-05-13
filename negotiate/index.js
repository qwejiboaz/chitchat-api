const { WebPubSubServiceClient } = require("@azure/web-pubsub");

module.exports = async function (context, req) {
  const playerName = req.query.playerName || "Player";
  const gameCode = req.query.gameCode || "0000";
  const hub = "chitchat";

  const serviceClient = new WebPubSubServiceClient(
    process.env.WEBPUBSUB_CONNECTION_STRING,
    hub
  );

  const token = await serviceClient.getClientAccessToken({
    userId: playerName,
    groups: [gameCode],
    roles: [
      `webpubsub.joinLeaveGroup.${gameCode}`,
      `webpubsub.sendToGroup.${gameCode}`
    ]
  });

  context.res = {
    headers: { "Content-Type": "application/json" },
    body: { url: token.url }
  };
};
