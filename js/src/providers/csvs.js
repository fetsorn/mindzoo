import csvs from "@fetsorn/csvs-js";

function SELECT(fs, dir, query) {
  return csvs.selectRecordStreamPull({
    fs,
    dir,
    query,
    light: true,
  });
}

function DESCRIBE(fs, dir, query) {
  return new ReadableStream({
    async pull(controller) {
      const record = await csvs.buildRecord({
        fs,
        dir,
        query: [query],
        prose: true,
      });

      controller.enqueue(record);

      controller.close();
    },
  });
}

function DELETE(fs, dir, query) {
  return new ReadableStream({
    async pull(controller) {
      await csvs.deleteRecord({ fs, dir, query });

      controller.close();
    },
  });
}

function UPDATE(fs, dir, query) {
  return new ReadableStream({
    async pull(controller) {
      await csvs.init({ fs, dir });

      await csvs.updateRecord({ fs, dir, query });

      controller.close();
    },
  });
}

function sparql(providers, dir, { kind, graph, query }) {
  // TODO accept sparql string and infer kind with haydee
  // const { kind, graph, inner } = await haydee.classify(sparql);
  // NOTE graph should be used to say "to schema named graph"
  // instead of "to schema base"

  switch (kind) {
    case "SELECT":
      return SELECT(providers, dir, query);

    case "DESCRIBE":
      return DESCRIBE(providers, dir, query);

    case "UPDATE":
      return UPDATE(providers, dir, query);

    case "DELETE":
      return DELETE(providers, dir, query);
  }
}

export default (fs, dir) => ({
  sparql: (query) => sparql(fs, dir, query),
});
