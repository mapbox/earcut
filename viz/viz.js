import earcut, {flatten, deviation, refine} from '../src/earcut.js';

const params = new URLSearchParams(window.location.search.substring(1));

const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
const area = document.getElementById('canvas-area');
const fixturesEl = document.getElementById('fixtures');
const refineEl = document.getElementById('refine');
const rotationEl = document.getElementById('rotation');
const statsEl = document.getElementById('stats');

const defaultFixture = 'water-huge3';
const rotations = [0, 90, 180, 270];
let current = params.get('fixture') || defaultFixture;
let rotation = +params.get('rotation') || 0;
let state = null; // computed data for the current fixture, reused across redraws/toggles
let loadToken = 0;
let frame = 0;

if (!rotations.includes(rotation)) rotation = 0;

// build the fixture list from the names in expected.json
const expected = await (await fetch('../test/expected.json')).json();
const fixtureNames = Object.keys(expected.triangles);
if (!fixtureNames.includes(current)) current = defaultFixture;

for (const name of fixtureNames) {
    const option = document.createElement('option');
    option.textContent = name;
    option.value = name;
    fixturesEl.appendChild(option);
}
fixturesEl.oninput = () => {
    current = fixturesEl.value;
    select();
};

refineEl.checked = params.get('refine') === '1';
refineEl.onchange = () => {
    updateURL();
    update();
};
for (const value of rotations) {
    const option = document.createElement('option');
    option.textContent = `${value}°`;
    option.value = value;
    rotationEl.appendChild(option);
}
rotationEl.value = rotation;
rotationEl.onchange = () => {
    rotation = +rotationEl.value;
    select();
};
addEventListener('resize', scheduleDraw);

select();

function select() {
    fixturesEl.value = current;
    updateURL();
    state = null;
    drawLoadingStats();
    const token = ++loadToken;
    const name = current;
    requestAnimationFrame(() => load(name, token));
}

function updateURL() {
    const url = new URL(location);
    if (current === defaultFixture) url.searchParams.delete('fixture');
    else url.searchParams.set('fixture', current);
    if (rotation) url.searchParams.set('rotation', rotation);
    else url.searchParams.delete('rotation');
    if (refineEl.checked) url.searchParams.set('refine', '1');
    else url.searchParams.delete('refine');
    history.replaceState(null, '', url);
}

// load + triangulate the current fixture from scratch (base triangulation only)
async function load(name, token) {
    const rings = rotate(await (await fetch(`../test/fixtures/${name}.json`)).json(), rotation);
    if (token !== loadToken) return;

    const data = flatten(rings);

    const base = earcut(data.vertices, data.holes, data.dimensions);
    const baseTime = bench(() => earcut(data.vertices, data.holes, data.dimensions));

    state = {
        rings, data, base, baseTime,
        refined: null, refineTime: 0,
        deviation: deviation(data.vertices, data.holes, data.dimensions, base),
        bounds: ringBounds(rings[0]),
        paths: null // {key, outline, baseMesh, refinedMesh} — cached Path2Ds, rebuilt on resize
    };
    if (token === loadToken) update();
}

// refine on demand and cache it, so toggling back and forth is instant
function update() {
    if (!state) {
        drawLoadingStats();
        return;
    }
    if (refineEl.checked && !state.refined) {
        const {vertices, dimensions} = state.data;
        state.refined = state.base.slice();
        refine(state.refined, vertices, dimensions);
        // re-refine fresh copies of the base triangulation to time it in isolation
        state.refineTime = bench(() => refine(state.base.slice(), vertices, dimensions));
    }
    drawStats();
    scheduleDraw();
}

function scheduleDraw() {
    if (frame) return;
    frame = requestAnimationFrame(() => {
        frame = 0;
        draw();
    });
}

function rotate(rings, deg) {
    if (!deg) return rings;
    const theta = deg * Math.PI / 180;
    const round = deg % 90 === 0 ? Math.round : x => x;
    const xx = round(Math.cos(theta)), xy = round(-Math.sin(theta));
    const yx = round(Math.sin(theta)), yy = round(Math.cos(theta));
    return rings.map(ring => ring.map(([x, y]) => [xx * x + xy * y, yx * x + yy * y]));
}

function ringBounds(ring) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const [x, y] of ring) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
    }
    return {minX, minY, w: maxX - minX, h: maxY - minY};
}

function draw() {
    if (!state) return;
    const pad = 15;
    const W = area.clientWidth, H = area.clientHeight;
    const {minX, minY, w, h} = state.bounds;
    const scale = Math.min((W - 2 * pad) / w, (H - 2 * pad) / h);
    // center within the canvas area
    const ox = (W - w * scale) / 2, oy = (H - h * scale) / 2;

    // (re)build the Path2Ds only when the projection changes; toggling refine then just rasterizes
    const key = `${W}x${H}`;
    if (!state.paths || state.paths.key !== key) state.paths = {key};
    const paths = state.paths;
    const which = refineEl.checked ? 'refined' : 'base';
    const meshKey = `${which}Mesh`;
    const px = x => (x - minX) * scale + ox;
    const py = y => (y - minY) * scale + oy;

    if (!paths[meshKey]) {
        paths[meshKey] = meshPath(refineEl.checked ? state.refined : state.base, state.data, px, py);
    }
    if (!paths.outline) {
        const p = new Path2D();
        for (const ring of state.rings) {
            ring.forEach(([x, y], i) => i ? p.lineTo(px(x), py(y)) : p.moveTo(px(x), py(y)));
            p.closePath();
        }
        paths.outline = p;
    }

    const dpr = devicePixelRatio || 1;
    const cw = Math.round(W * dpr);
    const ch = Math.round(H * dpr);
    if (canvas.width !== cw || canvas.height !== ch) {
        canvas.width = cw;
        canvas.height = ch;
        canvas.style.width = `${W}px`;
        canvas.style.height = `${H}px`;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.lineJoin = 'round';

    ctx.fillStyle = '#fffbd6';
    ctx.fill(paths.outline, 'evenodd');

    ctx.lineWidth = 0.5;
    ctx.strokeStyle = '#f24a4a';
    ctx.stroke(paths[meshKey]);

    ctx.lineWidth = 1;
    ctx.strokeStyle = '#333';
    ctx.stroke(paths.outline);
}

function meshPath(result, data, px, py) {
    const p = new Path2D();
    const dim = data.dimensions, v = data.vertices;

    for (let i = 0; i < result.length; i += 3) {
        const ai = result[i] * dim;
        const bi = result[i + 1] * dim;
        const ci = result[i + 2] * dim;
        p.moveTo(px(v[ai]), py(v[ai + 1]));
        p.lineTo(px(v[bi]), py(v[bi + 1]));
        p.lineTo(px(v[ci]), py(v[ci + 1]));
        p.lineTo(px(v[ai]), py(v[ai + 1]));
    }
    return p;
}

// performance.now() is clamped to ~100µs in browsers, so a single run of a fast fixture
// reads 0; repeat until we've accumulated enough wall time and return the mean per run
function bench(fn) {
    fn(); // warm up
    let runs = 0;
    const start = performance.now();
    while (performance.now() - start < 20 && runs < 100000) {
        fn();
        runs++;
    }
    return (performance.now() - start) / runs;
}

function ms(t) {
    return `${Math.round(1e3 * t) / 1e3} ms`;
}

function statsRow(label, value) {
    return `<div><span class="label">${label}</span><span>${value}</span></div>`;
}

function drawLoadingStats() {
    statsEl.innerHTML =
        statsRow('vertices', '...') +
        statsRow('triangles', '...') +
        statsRow('earcut', '...') +
        statsRow('refine', refineEl.checked ? '...' : '–') +
        statsRow('deviation', '...');
}

function drawStats() {
    const result = refineEl.checked ? state.refined : state.base;
    statsEl.innerHTML =
        statsRow('vertices', (state.data.vertices.length / state.data.dimensions).toLocaleString()) +
        statsRow('triangles', (result.length / 3).toLocaleString()) +
        statsRow('earcut', ms(state.baseTime)) +
        statsRow('refine', refineEl.checked ? ms(state.refineTime) : '–') +
        statsRow('deviation', state.deviation ? state.deviation.toExponential(2) : '0');
}
