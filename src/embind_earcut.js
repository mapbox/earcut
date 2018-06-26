const earcut_wasm = require('./earcut_wasm');

module.exports = earcut;
module.exports.default = earcut;

function earcut(data, holeIndices) {
    var vertices = new earcut_wasm.VectorFloat64;
    for (const vertex of data) {
        vertices.push_back(vertex);
    }
    var holes = new earcut_wasm.VectorUint32;
    for (const hole of holeIndices) {
        holes.push_back(hole);
    }
    var wasmResult = earcut_wasm.earcut_wrapper(vertices, holes);
    var result = [];
    for (var i = 0; i < wasmResult.size(); i++) {
        result.push(wasmResult.get(i));
    }
    return result;
}
