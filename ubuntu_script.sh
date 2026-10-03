#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

if [[ ! -f compose.yaml || ! -f .env.example ]]; then
	echo "Run this script from the Forkity project files." >&2
	exit 1
fi

if [[ ! -r /etc/os-release ]]; then
	echo "Cannot identify this Linux distribution." >&2
	exit 1
fi

. /etc/os-release
case "${ID:-}" in
	ubuntu|debian) ;;
	*)
		echo "This script supports Ubuntu and Debian only." >&2
		exit 1
		;;
esac

DOCKER_CODENAME="${UBUNTU_CODENAME:-${VERSION_CODENAME:-}}"
if [[ -z "$DOCKER_CODENAME" ]]; then
	echo "Could not determine the distribution codename." >&2
	exit 1
fi

DOCKER_READY=false
DOCKER_VIA_SUDO=false
if command -v docker >/dev/null 2>&1; then
	if docker info >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then
		DOCKER_READY=true
	elif [[ "$EUID" -ne 0 ]] && command -v sudo >/dev/null 2>&1 && sudo -n docker info >/dev/null 2>&1 && sudo -n docker compose version >/dev/null 2>&1; then
		DOCKER_READY=true
		DOCKER_VIA_SUDO=true
	fi
fi

SUDO=()
if [[ "$EUID" -ne 0 ]] && { [[ "$DOCKER_READY" != true ]] || ! command -v openssl >/dev/null 2>&1; }; then
	if ! command -v sudo >/dev/null 2>&1; then
		echo "Install sudo or run this script as root." >&2
		exit 1
	fi
	SUDO=(sudo)
	"${SUDO[@]}" -v
fi

run_root() {
	"${SUDO[@]}" "$@"
}

run_docker() {
	if [[ "$DOCKER_VIA_SUDO" == true ]] || { [[ "$EUID" -ne 0 ]] && ! docker info >/dev/null 2>&1; }; then
		sudo docker "$@"
	else
		docker "$@"
	fi
}

if [[ "$DOCKER_READY" != true ]] && dpkg-query -S /usr/libexec/docker/docker-init 2>/dev/null | grep -q '^moby-tini:'; then
	echo "The installed moby-tini package conflicts with Docker CE in this container." >&2
	echo "Do not remove it here. Install Docker Engine on the Linux host, then run Docker Compose from this project." >&2
	exit 1
fi

if [[ "$DOCKER_READY" != true ]] || ! command -v openssl >/dev/null 2>&1; then
	echo "Installing application prerequisites..."
	run_root apt-get update
	run_root apt-get install -y ca-certificates curl openssl
fi

if [[ "$DOCKER_READY" != true ]]; then
	echo "Configuring Docker's official APT repository..."
	run_root install -m 0755 -d /etc/apt/keyrings
	run_root curl -fsSL "https://download.docker.com/linux/$ID/gpg" -o /etc/apt/keyrings/docker.asc
	run_root chmod a+r /etc/apt/keyrings/docker.asc

	ARCHITECTURE="$(dpkg --print-architecture)"
	run_root tee /etc/apt/sources.list.d/docker.sources >/dev/null <<EOF
Types: deb
URIs: https://download.docker.com/linux/$ID
Suites: $DOCKER_CODENAME
Components: stable
Architectures: $ARCHITECTURE
Signed-By: /etc/apt/keyrings/docker.asc
EOF

	echo "Installing Docker Engine and the Compose plugin..."
	run_root apt-get update
	run_root apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
else
	echo "Using the existing Docker Engine and Compose plugin."
fi

if [[ ! -f .env ]]; then
	cp .env.example .env
fi

if ! grep -q '^POSTGRES_PASSWORD=' .env || grep -Eq '^POSTGRES_PASSWORD=(change_me_before_use)?$' .env; then
	DB_PASSWORD="$(openssl rand -hex 32)"
	if grep -q '^POSTGRES_PASSWORD=' .env; then
		sed -i "s/^POSTGRES_PASSWORD=.*/POSTGRES_PASSWORD=$DB_PASSWORD/" .env
	else
		printf '\nPOSTGRES_PASSWORD=%s\n' "$DB_PASSWORD" >> .env
	fi
fi

echo "Checking Docker and Compose..."
run_docker run --rm hello-world
run_docker compose version

echo "Building and starting Forkity..."
run_docker compose up --build -d
run_docker compose ps

echo "Forkity is starting. Open the port set by FORKITY_PORT in .env (default: http://localhost:8080)."