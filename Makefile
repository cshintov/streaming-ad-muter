.PHONY: build clean zip install

build: clean
	@echo "Building extension..."

clean:
	@echo "Cleaning up..."
	rm -f extension.zip

zip: clean
	@echo "Creating extension zip..."
	zip -r extension.zip manifest.json background.js popup.html popup.js content.js icon.png README.md

install: zip
	@echo "To install:"
	@echo "1. Go to chrome://extensions/"
	@echo "2. Enable Developer Mode"
	@echo "3. Load unpacked -> select directory"

dev: install
	@echo "Starting development mode..."
	@echo "Edit files and reload extension to see changes"