const inputs = {
  wavelength: document.getElementById("wavelength"),
  slitWidth: document.getElementById("slitWidth"),
  slitHeight: document.getElementById("slitHeight"),
  separation: document.getElementById("separation"),
  distance: document.getElementById("distance"),
  phase: document.getElementById("phase"),
};

const outputs = {
  wavelength: document.getElementById("wavelengthValue"),
  slitWidth: document.getElementById("slitWidthValue"),
  slitHeight: document.getElementById("slitHeightValue"),
  separation: document.getElementById("separationValue"),
  distance: document.getElementById("distanceValue"),
  phase: document.getElementById("phaseValue"),
};

const surfaceEl = document.getElementById("surfacePlot");
const intensityEl = document.getElementById("intensityPlot");
const lineEl = document.getElementById("linePlot");

const sinc = (u) => (Math.abs(u) < 1e-8 ? 1 : Math.sin(u) / u);

const plotTheme = {
  paper_bgcolor: "rgba(0,0,0,0)",
  plot_bgcolor: "rgba(0,0,0,0)",
  font: { color: "#dfeaff", family: "Avenir Next, Segoe UI, sans-serif" },
};

function getParameters() {
  return {
    lambda: Number(inputs.wavelength.value) * 1e-9,
    a: Number(inputs.slitWidth.value) * 1e-6,
    h: Number(inputs.slitHeight.value) * 1e-6,
    d: Number(inputs.separation.value) * 1e-6,
    L: Number(inputs.distance.value),
    phase: Number(inputs.phase.value),
  };
}

function updateLabels(params) {
  outputs.wavelength.textContent = `${inputs.wavelength.value} nm`;
  outputs.slitWidth.textContent = `${inputs.slitWidth.value} μm`;
  outputs.slitHeight.textContent = `${inputs.slitHeight.value} μm`;
  outputs.separation.textContent = `${inputs.separation.value} μm`;
  outputs.distance.textContent = `${inputs.distance.value} m`;
  outputs.phase.textContent = `${params.phase.toFixed(2)} rad`;
}

function buildGrid(range, points) {
  const arr = [];
  const step = (2 * range) / (points - 1);
  for (let i = 0; i < points; i += 1) {
    arr.push(-range + i * step);
  }
  return arr;
}

function computeFields(params) {
  const xRange = 0.02;
  const yRange = 0.02;
  const n = 90;
  const xs = buildGrid(xRange, n);
  const ys = buildGrid(yRange, n);

  const psiReal = [];
  const intensity = [];

  for (let yi = 0; yi < ys.length; yi += 1) {
    const y = ys[yi];
    const rowPsi = [];
    const rowI = [];

    for (let xi = 0; xi < xs.length; xi += 1) {
      const x = xs[xi];
      const betaX = Math.PI * params.a * x / (params.lambda * params.L);
      const betaY = Math.PI * params.h * y / (params.lambda * params.L);
      const alpha = Math.PI * params.d * x / (params.lambda * params.L);

      const envelope = sinc(betaX) * sinc(betaY);
      const interference = 2 * Math.cos(alpha);
      const amplitude = envelope * interference;
      const realPart = amplitude * Math.cos(params.phase);

      rowPsi.push(realPart);
      rowI.push(amplitude * amplitude);
    }

    psiReal.push(rowPsi);
    intensity.push(rowI);
  }

  const mid = Math.floor(ys.length / 2);
  const line = intensity[mid];

  return { xs, ys, psiReal, intensity, line };
}

function draw() {
  const params = getParameters();
  updateLabels(params);
  const { xs, ys, psiReal, intensity, line } = computeFields(params);

  const xMM = xs.map((x) => x * 1e3);
  const yMM = ys.map((y) => y * 1e3);

  Plotly.react(
    surfaceEl,
    [
      {
        x: xMM,
        y: yMM,
        z: psiReal,
        type: "surface",
        colorscale: [
          [0, "#1f3b83"],
          [0.5, "#5cc9f5"],
          [1, "#f6c65b"],
        ],
      },
    ],
    {
      ...plotTheme,
      margin: { l: 0, r: 0, b: 0, t: 0 },
      scene: {
        xaxis: { title: "x (mm)", gridcolor: "rgba(120,160,220,0.25)" },
        yaxis: { title: "y (mm)", gridcolor: "rgba(120,160,220,0.25)" },
        zaxis: { title: "Re(ψ)", gridcolor: "rgba(120,160,220,0.25)" },
        camera: { eye: { x: 1.5, y: 1.2, z: 0.8 } },
        bgcolor: "rgba(0,0,0,0)",
      },
    },
    { responsive: true }
  );

  Plotly.react(
    intensityEl,
    [
      {
        x: xMM,
        y: yMM,
        z: intensity,
        type: "heatmap",
        colorscale: "Viridis",
      },
    ],
    {
      ...plotTheme,
      margin: { l: 50, r: 20, b: 45, t: 10 },
      xaxis: { title: "x (mm)", gridcolor: "rgba(120,160,220,0.25)" },
      yaxis: { title: "y (mm)", gridcolor: "rgba(120,160,220,0.25)" },
    },
    { responsive: true }
  );

  Plotly.react(
    lineEl,
    [
      {
        x: xMM,
        y: line,
        mode: "lines",
        line: { width: 2.6, color: "#f4c95d" },
      },
    ],
    {
      ...plotTheme,
      margin: { l: 50, r: 20, b: 45, t: 10 },
      xaxis: { title: "x (mm)", gridcolor: "rgba(120,160,220,0.25)" },
      yaxis: { title: "I(x, 0)", gridcolor: "rgba(120,160,220,0.25)" },
    },
    { responsive: true }
  );
}

Object.values(inputs).forEach((input) => {
  input.addEventListener("input", draw);
});

window.addEventListener("load", draw);
