#include <emscripten/bind.h>

#include "earcut.hpp"

#include <array>

using namespace emscripten;

// The number type to use for tessellation
using Coord = double;

// The index type. Defaults to uint32_t, but you can also pass uint16_t if you know that your
// data won't have more than 65536 vertices.
using N = uint32_t;

// Create array
using Point = std::array<Coord, 2>;

EMSCRIPTEN_BINDINGS(stl_wrappers) {
    register_vector<uint32_t>("VectorUint32");
    register_vector<double>("VectorFloat64");
}

std::vector<uint32_t> earcut_wrapper(const std::vector<double>& vertices, const std::vector<uint32_t>& holes) {
    std::vector<std::vector<Point>> polygon;
    size_t ringBegin = 0;
    for (size_t holeIndex = 0; holeIndex <= holes.size(); holeIndex++)
    {
        size_t ringEnd = holeIndex == holes.size() ? vertices.size() : (holes[holeIndex] * 2);
        std::vector<Point> ring;
        for (size_t i = ringBegin; i < ringEnd; i += 2) {
            ring.emplace_back(Point{vertices[i], vertices[i + 1]});

        }
        ringBegin = ringEnd;
        polygon.emplace_back(ring);
    }

    // Run tessellation
    // Returns array of indices that refer to the vertices of the input polygon.
    // e.g: the index 6 would refer to {25, 75} in this example.
    // Three subsequent indices form a triangle. Output triangles are clockwise.
    return mapbox::earcut<N>(polygon);
}

EMSCRIPTEN_BINDINGS(earcut) {
    function("earcut_wrapper", &earcut_wrapper);
}
