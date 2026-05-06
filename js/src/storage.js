import csvs from "@fetsorn/csvs-js";

async function SELECT(fs, dir, query) {
  return csvs.selectRecordStreamPull({
    fs,
    dir,
    query,
    light: true,
  });
}

async function DESCRIBE(fs, dir, query) {
  return csvs.buildRecord({ fs, dir, query: [query] });
}

async function DELETE(fs, dir, query) {
  return csvs.deleteRecord({
    fs,
    dir,
    query,
  });
}

async function sparql(providers, dir, { kind, graph, query }) {
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
      await DELETE(providers, dir, query);
  }
}

export default (fs, dir) => ({
  sparql: (query) => sparql(fs, dir, query),
});
