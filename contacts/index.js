const { TableClient } = require("@azure/data-tables");

module.exports = async function(context, req) {
  const method = req.method.toUpperCase();
  const PARTITION = "family";
  const TABLE_NAME = "contacts";

  let client;
  try {
    client = TableClient.fromConnectionString(
      process.env.STORAGE_CONNECTION_STRING,
      TABLE_NAME
    );
  } catch(e) {
    context.res = { status: 500, body: { error: "Storage connection failed: " + e.message } };
    return;
  }

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
      context.res = {
        status: 200,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(contacts)
      };

    } else if (method === "POST") {
      const { name, phone } = req.body;
      if (!name) {
        context.res = { status: 400, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ error: "Name required" }) };
        return;
      }
      const id = Date.now().toString();
      await client.createEntity({
        partitionKey: PARTITION,
        rowKey: id,
        name: name.trim(),
        phone: (phone || "").trim()
      });
      context.res = {
        status: 201,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, name: name.trim(), phone: (phone||"").trim() })
      };

    } else if (method === "DELETE") {
      const id = req.query.id;
      if (!id) {
        context.res = { status: 400, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ error: "ID required" }) };
        return;
      }
      await client.deleteEntity(PARTITION, id);
      context.res = { status: 200, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ deleted: true }) };

    } else if (method === "PUT") {
      const id = req.query.id;
      const { name, phone } = req.body;
      if (!id || !name) {
        context.res = { status: 400, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ error: "ID and name required" }) };
        return;
      }
      await client.updateEntity({
        partitionKey: PARTITION,
        rowKey: id,
        name: name.trim(),
        phone: (phone || "").trim()
      }, "Replace");
      context.res = {
        status: 200,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, name: name.trim(), phone: (phone||"").trim() })
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
