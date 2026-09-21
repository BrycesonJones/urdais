import { describe, expect, it } from "vitest";

import { decodeEntities, findTables, HtmlTableError, parseTable, resolveColumns, tableById }
  from "@/lib/interconnection-queue/html/table";

describe("the HTML table reader", () => {
  const page = `
    <html><body>
      <h1>Queue</h1>
      <table id="other"><tr><th>x</th></tr><tr><td>1</td></tr></table>
      <table id="publicqueue" class="grid sortable" data-x="1">
        <thead>
          <tr><th>QP</th><th>Type</th><th>Serv</th><th>Net MW</th><th>Summer MW</th></tr>
        </thead>
        <tbody>
          <tr class="row"><td>1090</td><td>G</td><td>CNR</td><td>0</td><td>838.2</td></tr>
          <tr><td>1116</td><td>G</td><td>NR</td><td>1200</td><td>1200</td></tr>
        </tbody>
      </table>
    </body></html>`;

  it("reads structure, not layout", () => {
    const table = tableById(page, "publicqueue")!;
    expect(table.headers).toEqual(["QP", "Type", "Serv", "Net MW", "Summer MW"]);
    expect(table.rows).toEqual([
      ["1090", "G", "CNR", "0", "838.2"],
      ["1116", "G", "NR", "1200", "1200"],
    ]);
  });

  it("finds a table by id and leaves the others alone", () => {
    expect(findTables(page)).toHaveLength(2);
    expect(tableById(page, "other")!.headers).toEqual(["x"]);
    expect(tableById(page, "absent")).toBeNull();
  });

  it("tolerates the markup changes a restyling makes", () => {
    const restyled = page
      .replace(/class="grid sortable"/, 'class="table table-striped" role="grid"')
      .replace(/<tr class="row">/, '<tr class="row odd" data-key="1090">')
      .replace(/<td>G<\/td>/, '<td ><span class="badge">G</span></td>')
      .replace(/\n\s+/g, " ");
    const table = tableById(restyled, "publicqueue")!;
    expect(table.headers).toEqual(["QP", "Type", "Serv", "Net MW", "Summer MW"]);
    expect(table.rows[0]).toEqual(["1090", "G", "CNR", "0", "838.2"]);
  });

  it("decodes the entities a queue page uses", () => {
    expect(decodeEntities("Black &amp; Veatch &lt;LLC&gt; &nbsp;&#65;&#x42;"))
      .toBe("Black & Veatch <LLC>  AB");
    // An entity it does not define is left exactly as written rather than mangled.
    expect(decodeEntities("&unknownthing;")).toBe("&unknownthing;");
  });

  it("never reads script or style content as a value", () => {
    const hostile = `<table id="q"><tr><th>A</th></tr>
      <tr><td><script>var x = "injected";</script>real</td></tr>
      <tr><td><style>.x{content:"css"}</style>also real</td></tr></table>`;
    const table = tableById(hostile, "q")!;
    expect(table.rows).toEqual([["real"], ["also real"]]);
    expect(JSON.stringify(table)).not.toContain("injected");
    expect(JSON.stringify(table)).not.toContain("css");
  });

  it("keeps positions aligned when a cell spans columns", () => {
    const spanned = `<table id="q"><tr><th>A</th><th>B</th><th>C</th></tr>
      <tr><td colspan="2">wide</td><td>third</td></tr></table>`;
    expect(tableById(spanned, "q")!.rows).toEqual([["wide", "", "third"]]);
  });

  it("handles a nested table without swallowing the outer one", () => {
    const nested = `<table id="outer"><tr><th>A</th></tr>
      <tr><td><table id="inner"><tr><td>in</td></tr></table></td></tr></table>`;
    const tables = findTables(nested);
    expect(tables.map((table) => table.id)).toEqual(["outer", "inner"]);
    expect(tableById(nested, "inner")!.rows).toEqual([["in"]]);
  });

  it("fails loudly on a table that is never closed", () => {
    expect(() => findTables('<table id="q"><tr><td>x</td></tr>')).toThrow(HtmlTableError);
  });

  it("collapses whitespace and preserves the text between it", () => {
    const messy = `<table id="q"><tr><th>A\n  B</th></tr><tr><td>  one   two\t</td></tr></table>`;
    const table = tableById(messy, "q")!;
    expect(table.headers).toEqual(["A B"]);
    expect(table.rows).toEqual([["one two"]]);
  });
});

describe("resolving columns", () => {
  const table = parseTable(
    "<tr><th>QP</th><th>Serv</th><th>SIS</th><th>Net MW</th><th>SIS</th></tr>"
    + "<tr><td>1</td><td>CNR</td><td>a</td><td>2</td><td>b</td></tr>", "q");

  it("matches on header text, ignoring case and whitespace", () => {
    const { index, missing } = resolveColumns(table, ["qp", "  Net   MW "]);
    expect(missing).toEqual([]);
    expect(index.get("qp")).toBe(0);
    expect(index.get("  Net   MW ")).toBe(3);
  });

  it("reports what is missing rather than guessing a position", () => {
    const { missing, index } = resolveColumns(table, ["QP", "Nameplate"]);
    expect(missing).toEqual(["Nameplate"]);
    expect(index.has("Nameplate")).toBe(false);
  });

  it("keeps every position of a repeated header, which ISO-NE has two of", () => {
    const { index, positions } = resolveColumns(table, ["SIS"]);
    expect(index.get("SIS")).toBe(2);
    expect(positions.get("sis")).toEqual([2, 4]);
  });
});
