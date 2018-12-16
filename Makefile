.PHONY: all build

BUILD_DIR := public

all: clean build

clean:
	rm -rf ./$(BUILD_DIR)/*

build:
	zola build

serve:
	zola serve

update-zola:
	@./bin/update-zola
