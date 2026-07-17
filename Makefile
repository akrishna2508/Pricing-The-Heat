.PHONY: install data train backtest reproduce test up down logs clean help

help:
	@echo "Pricing the Heat - Available targets:"
	@echo "  make install    - Install backend dependencies"
	@echo "  make data       - Fetch and process raw data"
	@echo "  make train      - Train models"
	@echo "  make backtest   - Run backtests"
	@echo "  make reproduce  - Regenerate all artifacts from cached data"
	@echo "  make test       - Run unit and e2e tests"
	@echo "  make up         - Start docker-compose services"
	@echo "  make down       - Stop docker-compose services"
	@echo "  make logs       - Tail docker logs"
	@echo "  make clean      - Remove build artifacts and cache"

install:
	pip install -r backend/requirements-torch.txt
	pip install -r backend/requirements.txt

data:
	PYTHONPATH=. python -m backend.data.build_wage_loss

train:
	PYTHONPATH=. python -m models.stgcn.train

backtest:
	@echo "TODO: Implement backtesting pipeline"

reproduce:
	PYTHONPATH=. python -m backend.data.build_wage_loss
	PYTHONPATH=. python -m models.stgcn.train

test:
	PYTHONPATH=. pytest tests/unit -q
	@echo "TODO: Implement e2e tests"

up:
	docker compose -f infra/docker-compose.yml up -d

down:
	docker compose -f infra/docker-compose.yml down

logs:
	docker compose -f infra/docker-compose.yml logs -f

clean:
	find . -type d -name __pycache__ -exec rm -rf {} +
	find . -type f -name "*.pyc" -delete
	rm -rf .pytest_cache
	@echo "Cleaned build artifacts"
