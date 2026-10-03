#!/usr/bin/env bash
# Stop on errors, unset variables, and failed commands in pipelines.
set -Eeuo pipefail

# Resolve this script's directory and then the parent project directory.
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd -- "$SCRIPT_DIR/.." && pwd)"
# Run project commands from the repository root.
cd "$PROJECT_DIR"

# Require the Compose file and sample settings before doing any setup.
if [[ ! -f compose.yaml || ! -f .env.example ]]; then
	echo "Run this script from the Forkity project files." >&2
	exit 1
fi

# Read and load distribution metadata to verify this is Rocky Linux.
if [[ ! -r /etc/os-release ]]; then
	echo "Cannot identify this Linux distribution." >&2
	exit 1
fi
. /etc/os-release
if [[ "${ID:-}" != rocky ]]; then
	echo "This script supports Rocky Linux only." >&2
	exit 1
fi

# Check whether Docker and Compose already work without elevated privileges.
DOCKER_READY=false
DOCKER_VIA_SUDO=false
if command -v docker >/dev/null 2>&1; then
	if docker info >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then
		DOCKER_READY=true
	# Otherwise, check whether they work through an existing sudo session.
	elif [[ "$EUID" -ne 0 ]] && command -v sudo >/dev/null 2>&1 && sudo -n docker info >/dev/null 2>&1 && sudo -n docker compose version >/dev/null 2>&1; then
		DOCKER_READY=true
		DOCKER_VIA_SUDO=true
	fi
fi

# Prepare sudo only when installing packages requires administrator access.
SUDO=()
if [[ "$EUID" -ne 0 ]] && { [[ "$DOCKER_READY" != true ]] || ! command -v openssl >/dev/null 2>&1; }; then
	if ! command -v sudo >/dev/null 2>&1; then
		echo "Install sudo or run this script as root." >&2
		exit 1
	fi
	SUDO=(sudo)
	# Cache the sudo authorization before running package commands.
	"${SUDO[@]}" -v
fi

# Run a system command as root, using sudo when this script is not root.
run_root() {
	"${SUDO[@]}" "$@"
}

# Run Docker directly when possible, or through sudo if needed.
run_docker() {
	if [[ "$DOCKER_VIA_SUDO" == true ]] || { [[ "$EUID" -ne 0 ]] && ! docker info >/dev/null 2>&1; }; then
		sudo docker "$@"
	else
		docker "$@"
	fi
}

# Stop if Docker CE would overwrite a container-provided Moby init binary.
if [[ "$DOCKER_READY" != true ]] && [[ -e /usr/libexec/docker/docker-init ]] && rpm -qf --qf '%{NAME}\n' /usr/libexec/docker/docker-init 2>/dev/null | grep -q '^moby'; then
	echo "A container-provided Moby package conflicts with Docker CE in this environment." >&2
	echo "Do not remove it here. Install Docker Engine on the Rocky Linux host, then run Docker Compose from this project." >&2
	exit 1
fi

# Install basic tools only if Docker or OpenSSL is missing.
if [[ "$DOCKER_READY" != true ]] || ! command -v openssl >/dev/null 2>&1; then
	echo "Installing application prerequisites..."
	# Install certificate, download, password-generation, and DNF plugin tools.
	run_root dnf install -y ca-certificates curl openssl dnf-plugins-core
fi

# Add Docker's official CentOS-compatible repository only when needed.
if [[ "$DOCKER_READY" != true ]]; then
	echo "Configuring Docker's official RPM repository..."
	# Register Docker's stable repository for CentOS-compatible distributions.
	run_root dnf config-manager --add-repo https://download.docker.com/linux/centos/docker-ce.repo

	echo "Installing Docker Engine and the Compose plugin..."
	# Install Docker Engine, its CLI, and the Compose/Buildx plugins.
	run_root dnf install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
	# Enable the Docker service and start it immediately.
	run_root systemctl enable --now docker
else
	echo "Using the existing Docker Engine and Compose plugin."
fi

# Create local settings from the example without overwriting an existing file.
if [[ ! -f .env ]]; then
	cp .env.example .env
fi

# Replace only an unset or sample database password with a random value.
if ! grep -q '^POSTGRES_PASSWORD=' .env || grep -Eq '^POSTGRES_PASSWORD=(change_me_before_use)?$' .env; then
	# Generate a strong hexadecimal password for PostgreSQL.
	DB_PASSWORD="$(openssl rand -hex 32)"
	if grep -q '^POSTGRES_PASSWORD=' .env; then
		# Update the existing password setting.
		sed -i "s/^POSTGRES_PASSWORD=.*/POSTGRES_PASSWORD=$DB_PASSWORD/" .env
	else
		# Add the password setting if the file did not contain one.
		printf '\nPOSTGRES_PASSWORD=%s\n' "$DB_PASSWORD" >> .env
	fi
fi

echo "Checking Docker and Compose..."

# Run Docker's test container to verify daemon access.
run_docker run --rm hello-world
# Confirm the Compose plugin is available.
run_docker compose version

echo "Building and starting Forkity..."
# Build the images and start all services in the background.
run_docker compose up --build -d
# Show the services and their current health/status.
run_docker compose ps

# Print the URL using the configured port, or the default port.
echo "Forkity is starting. Open the port set by FORKITY_PORT in .env (default: http://localhost:8080)."