'use strict';

exports.readTile = readTile;

function readTile(pbf, end) {
    return pbf.readFields(readTileField, {layers: []}, end);
}
function readTileField(tag, tile, pbf) {
    if (tag === 3) tile.layers.push(readLayer(pbf, pbf.readVarint() + pbf.pos));
}

// Value ========================================

function readValue(pbf, end) {
    var value;
    while (pbf.pos < end) {
        var tag = pbf.readVarint() >> 3;
        if (tag === 1) value = pbf.readString();
        else if (tag === 2) value = pbf.readFloat();
        else if (tag === 3) value = pbf.readDouble();
        else if (tag === 4) value = pbf.readVarint();
        else if (tag === 5) value = pbf.readVarint();
        else if (tag === 6) value = pbf.readSVarint();
        else if (tag === 7) value = pbf.readBoolean();
    }
    return value;
}

// Geometry =======================================

function readGeometry(pbf, end) {
    var length = 0;
    var x = 0;
    var y = 0;
    var cmd, line;
    var lines = [];

    while (pbf.pos < end) {
        if (length === 0) {
            var cmdLen = pbf.readVarint();
            cmd = cmdLen & 0x7;
            length = cmdLen >> 3;
        }

        if (cmd === 1 || cmd === 2) {
            if (cmd === 1) {
                line = [];
                lines.push(line);
            }

            x += pbf.readSVarint();
            y += pbf.readSVarint();
            line.push([x, y]);

        } else if (cmd === 7) {
            line.push(line[0]);

        } else {
            throw new Error('Unknown command ' + cmd);
        }

        length--;
    }

    return lines;
}

// Feature ========================================

function readFeature(pbf, end) {
    return pbf.readFields(readFeatureField, {}, end);
}
function readFeatureField(tag, feature, pbf) {
    if (tag === 1) feature.id = pbf.readVarint();
    else if (tag === 2) feature.tags = pbf.readPackedVarint();
    else if (tag === 3) feature.type = pbf.readVarint();
    else if (tag === 4) feature.geometry = readGeometry(pbf, pbf.readVarint() + pbf.pos);
}


// Layer ========================================

function readLayer(pbf, end) {
    return pbf.readFields(readLayerField, {features: [], keys: [], values: []}, end);
}
function readLayerField(tag, layer, pbf) {
    if (tag === 15) {
        layer.version = pbf.readVarint();
        // console.log(layer.version);
    }
    else if (tag === 1) layer.name = pbf.readString();
    else if (tag === 2) layer.features.push(readFeature(pbf, pbf.readVarint() + pbf.pos));
    else if (tag === 3) layer.keys.push(pbf.readString());
    else if (tag === 4) layer.values.push(readValue(pbf, pbf.readVarint() + pbf.pos));
    else if (tag === 5) layer.extent = pbf.readVarint();
}
