const { TableClient, AzureNamedKeyCredential } = require("@azure/data-tables");

const TABLE_NAME = "contacts";

async function getClient() {
  const connStr = process.env.STORAGE_CONNECTION_STRING;
  return TableClient.fromConnectionString(connStr, TABLE_NAME, {
    allowInsecureConnection: false
  });
}

async function ensureTable(client) {
  try { await client.createTable(); } catch(e) {}
}

module.exports = async function(context, req) {
  const method = req.method.toUpperCase();
  const client = await getClient();
  await ensureTable(client);

  // All contacts belong to a single partition "family"
  const PARTITION = "family";

  try {
    if (method === "GET") {
      const contacts = [];
      const iter = client.listEntities({
        queryOptions: { filter: `PartitionKey eq '${PARTITION}'` }
      });
      for await (const entity of iter) {
        contacts.push({
          id: entity.rowKey,
          name: entity.name,
          phone: entity.phone
        });
      }
      contacts.sort((a, b) => a.name.localeCompare(b.name));
      context.res = { status: 200, body: contacts };

    } else if (method === "POST") {
      const { name, phone } = req.body;
      if (!name) {
        context.res = { status: 400, body: { error: "Name is required" } };
        return;
      }
      const id = Date.now().toString();
      await client.createEntity({
        partitionKey: PARTITION,
        rowKey: id,
        name: name.trim(),
        phone: (phone || "").trim()
      });
      context.res = { status: 201, body: { id, name, phone } };

    } else if (method === "DELETE") {
      const id = req.query.id;
      if (!id) {
        context.res = { status: 400, body: { error: "ID required" } };
        return;
      }
      await client.deleteEntity(PARTITION, id);
      context.res = { status: 200, body: { deleted: true } };

    } else if (method === "PUT") {
      const id = req.query.id;
      const { name, phone } = req.body;
      if (!id || !name) {
        context.res = { status: 400, body: { error: "ID and name required" } };
        return;
      }
      await client.updateEntity({
        partitionKey: PARTITION,
        rowKey: id,
        name: name.trim(),
        phone: (phone || "").trim()
      }, "Replace");
      context.res = { status: 200, body: { id, name, phone } };

    } else {
      context.res = { status: 405, body: { error: "Method not allowed" } };
    }

  } catch(e) {
    context.res = { status: 500, body: { error: e.message } };
  }
};
