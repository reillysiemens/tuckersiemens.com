.PHONY: all build

BUILD_DIR := public

all: clean build

clean:
	rm -rf ./$(BUILD_DIR)/*

build:
	gulp sass
	gutenberg build
