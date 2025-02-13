import { editor, space, index } from "$sb/silverbullet-syscall/mod.ts";
import { asset } from "$sb/plugos-syscall/mod.ts";
import { StateProvider } from "stateprovider";
import { ColorMap, ColorMapBuilder } from "colormap";
import { SpaceGraph } from "model";
import { readGraphviewSettings } from "utils";
import { GraphIgnore } from "graphignore";

const stateProvider = new StateProvider("showGraphView");
const colorMapBuilder = new ColorMapBuilder();


// Toggle Graph View and sync state
export async function toggleGraphView() {
  await stateProvider.toggleGraphViewStatus();
  if (await stateProvider.getGraphViewStatus()) {
    const name = await editor.getCurrentPage();
    await renderGraph(name);
  } else {
    await editor.hidePanel("lhs");
  }
}

// if something changes, redraw
export async function updateGraphView() {
  const name = await editor.getCurrentPage();
  await renderGraph(name);
}

// render function into the LHS-Panel
async function renderGraph(page: any) {
  // https://github.com/d3/d3-force
  const graph = await buildGraph(page);
  const graph_json = JSON.stringify(graph);
  const css = await asset.readAsset("style.css");
  if (await stateProvider.getGraphViewStatus()) {
    await editor.showPanel(
      "lhs",
      1, // panel flex property
      `<html>
        <head>
          <style>${css}</style>
        </head>
        <body>
          <div id="graph" >
          </div>
        </body>
      </html>`,
      await script(graph_json), // Script (java script as string)
    );
  }
}

// Embed script
async function script(graph: any) {
  const d3js = await asset.readAsset("asset/d3.js", "utf8");
  const d3forcejs = await asset.readAsset("asset/d3-force.js", "utf8");
  const d3forcegraph = await asset.readAsset(
    "asset/force-graph.js",
    "utf8",
  );

  return `
    ${d3js}
    ${d3forcejs}
    ${d3forcegraph}
    
    const graph = ${graph};
    console.log(graph);
    const graph_div = document.querySelector('#graph');
    
    let chart;
    function createChart() {
      // Remove the existing chart object from the DOM
      graph_div.innerHTML = '';
    
      // Create a new chart object with the updated dimensions
      chart = ForceGraph(graph, {
        nodeId: d => d.id,
        nodeTitle: d => d.id,
        nodeStrokeOpacity: 0.75,
        height: window.innerHeight,
        width: window.innerWidth,
      });
    
      // Add the new chart object to the DOM
      graph_div.appendChild(chart);
    }
    
    createChart();

    function handleResize() {
      // Check if the dimensions have actually changed
      if (window.innerHeight-10 !== chart.height || window.innerWidth-10 !== chart.width) {
        // Recreate/redraw the chart object
        createChart();
      }
    }
        
    let timeout = false;
    // Add an event listener to the window object that listens for the resize event
    window.addEventListener('resize', () => {
      clearTimeout(timeout);
      timeout = setTimeout(handleResize, 250);
    });
  `;
}



// Build a SpaceGraph object from the current space
async function buildGraph(name: string): Promise<SpaceGraph> {
  const graphignore = new GraphIgnore();
  await graphignore.init();

  // Get all pages in space
  const pages = await space.listPages();
  const nodeNames = pages
    .filter(graphignore.pagefilter)
    .map(({ name }) => {
      return name;
    });

  // NOTE: This may result to the same link showing multiple times
  //       if the same page has multiple references to another page.
  const pageLinks = await index.queryPrefix(`l:`);
  const links = pageLinks
    .filter(graphignore.linkfilter)
    .map(({ key, page }) => {
      const to = key.split(':')
        .slice(1, -1)
        .join(':'); // Key: pl:page:pos

      if (!nodeNames.includes(to)) {
        // Add nodes for non-existing pages which are linked to
        nodeNames.push(to);
      }
      return { "source": page, "target": to };
    });

  await colorMapBuilder.init();
  const colors: ColorMap[] = colorMapBuilder.build()
  const default_color = await readGraphviewSettings("default_color");

  const nodes = nodeNames.map((name) => {
    // if page in colors → map color code to page name
    let color = default_color ? default_color : "000000";
    if (colors.find((c) => c.page === name)) {
      color = colors.find((c) => c.page === name).color;
    }
    return { "id": name, "color": color };
  });

  return { "nodes": nodes, "links": links };
}


