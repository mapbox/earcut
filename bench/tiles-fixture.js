import {readFileSync} from 'fs';
import {flatten} from '../src/earcut.js';

// Reads tiles-fixture.bin: length-delimited packed-varint MVT geometry blobs,
// one per polygon feature. Decodes them with a small varint reader (no pbf
// dependency), reconstructs polygons by splitting multipolygons and classifying
// holes by signed area, per the MVT spec.
//
// tiles-fixture.bin format (little-endian LEB128 unsigned varints throughout):
//
//   file    := tile*                     (repeated until EOF)
//   tile    := zoom featureCount feature*
//   feature := geomLen geom              (geomLen = number of varints in geom)
//   geom    := uint32*                   (raw MVT command/parameter integers)
//
// The geom integers are the native MVT polygon encoding: MoveTo/LineTo/ClosePath
// command-integers interleaved with zigzag delta-encoded coordinate pairs.
export function readTilesFixture() {
    const buf = readFileSync(new URL('./tiles-fixture.bin', import.meta.url));
    const cursor = {pos: 0};
    const polys = [];

    while (cursor.pos < buf.length) {
        const z = readVarint(buf, cursor);
        const features = readVarint(buf, cursor);

        for (let feature = 0; feature < features; feature++) {
            const count = readVarint(buf, cursor);

            const geom = new Array(count);
            for (let i = 0; i < count; i++) geom[i] = readVarint(buf, cursor);

            let current = null;
            const push = (rings) => {
                const data = flatten(rings);
                data.z = z;
                polys.push(data);
            };

            for (const ring of decodeMvtRings(geom)) {
                if (ring.length < 3) continue;

                const area = ringArea(ring);
                if (area === 0) continue;

                if (area > 0) {
                    if (current) push(current);
                    current = [ring];
                } else if (current) {
                    current.push(ring);
                }
            }
            if (current) push(current);
        }
    }

    return polys;
}

function readVarint(buf, cursor) {
    let val = 0;
    let shift = 0;
    let b;
    do {
        let pos = cursor.pos;
        b = buf[pos++];
        cursor.pos = pos;
        val |= (b & 0x7f) << shift;
        shift += 7;
    } while (b & 0x80);
    return val >>> 0;
}

function decodeMvtRings(geom) {
    const rings = [];
    let x = 0;
    let y = 0;
    let ring = null;
    let i = 0;

    while (i < geom.length) {
        const cmd = geom[i] & 0x7;
        const count = geom[i] >> 3;
        i++;

        if (cmd === 1) {
            for (let k = 0; k < count; k++) {
                x += zigZagDecode(geom[i++]);
                y += zigZagDecode(geom[i++]);
                if (ring) rings.push(ring);
                ring = [[x, y]];
            }
        } else if (cmd === 2) {
            for (let k = 0; k < count; k++) {
                x += zigZagDecode(geom[i++]);
                y += zigZagDecode(geom[i++]);
                ring.push([x, y]);
            }
        } else if (cmd === 7 && ring) {
            rings.push(ring);
            ring = null;
        }
    }

    if (ring) rings.push(ring);
    return rings;
}

function zigZagDecode(n) {
    return (n >> 1) ^ (-(n & 1));
}

function ringArea(ring) {
    let sum = 0;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        sum += (ring[j][0] - ring[i][0]) * (ring[i][1] + ring[j][1]);
    }
    return sum / 2;
}
