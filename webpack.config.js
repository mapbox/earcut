const path = require('path');

module.exports = {
    entry: "./index_browser.js",
    output: {
        path: path.resolve(__dirname, "dist"),
        filename: "index.js",
    },
    mode: "development",
    module: {
        noParse: [
            /benchmark/,
        ]
    }
};
