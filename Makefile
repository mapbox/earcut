earcut_wasm.js: src/earcut_wrapper.cpp
	emcc --bind -std=c++11 -Oz -v -o src/earcut_wasm.js src/earcut_wrapper.cpp \
		-s EXPORTED_FUNCTIONS="['earcut_wrapper']" \
		-s NO_EXIT_RUNTIME="1" \
		-s DEAD_FUNCTIONS="[]" \
		-s NO_FILESYSTEM="1" \
		-s INLINING_LIMIT="1" \
		-s ALLOW_MEMORY_GROWTH="1" \
		-s WASM=1 \
		--llvm-lto 3 \
		--memory-init-file 0 \
		--closure 0
