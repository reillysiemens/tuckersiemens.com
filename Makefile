.PHONY: all build

BUILD_DIR := public

all: clean build

clean:
	rm -rf ./$(BUILD_DIR)/*

build:
	gutenberg build

serve:
	gutenberg serve
