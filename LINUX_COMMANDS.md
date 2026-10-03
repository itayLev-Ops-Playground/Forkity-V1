# Run Forkity on Linux
- Run ubuntu_script.sh if on a Ubuntu Linux machine. Run './ubuntu_script.sh'
- This will install all application requierments and run the containers.
- Then open your browser. Paste 'http://localhost:5173' in the browser address bar. 

## Requirements

- Docker Engine with Linux containers
- Docker Compose v2 (`docker compose`)
- `openssl` to generate a database password

On Ubuntu or Debian, install Docker Engine and the Compose plugin from Docker's official APT repository:

Run these installation commands on the Linux host, not inside a Codespace or development container. Docker CE can conflict with container-provided packages such as `moby-tini`. In a development container, use the Docker Engine provided by its host instead of installing another Engine inside the container.

```sh
sudo apt-get update
sudo apt-get install -y ca-certificates curl openssl

. /etc/os-release
case "$ID" in
	ubuntu|debian) ;;
	*) echo "This installation block supports Ubuntu and Debian." >&2; exit 1 ;;
esac
DOCKER_CODENAME="${UBUNTU_CODENAME:-$VERSION_CODENAME}"

sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL "https://download.docker.com/linux/$ID/gpg" -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc

sudo tee /etc/apt/sources.list.d/docker.sources > /dev/null <<EOF
Types: deb
URIs: https://download.docker.com/linux/$ID
Suites: $DOCKER_CODENAME
Components: stable
Architectures: $(dpkg --print-architecture)
Signed-By: /etc/apt/keyrings/docker.asc
EOF

sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
```

To run the application commands below without `sudo`, add your user to the `docker` group and start a shell with the new group membership:

```sh
sudo usermod -aG docker "$USER"
newgrp docker
```

Membership in the `docker` group grants root-level privileges. If you do not want that, skip these two commands and prefix Docker commands below with `sudo`.

Verify the installation:

```sh
docker --version
docker compose version
docker run hello-world
```

## Start the application

Run these commands from the repository root:

```sh
cp .env.example .env
sed -i "s/^POSTGRES_PASSWORD=.*/POSTGRES_PASSWORD=$(openssl rand -hex 32)/" .env
docker compose up --build -d
docker compose ps
```

Open [http://localhost:8080](http://localhost:8080). The first build may take a few minutes. The `db` and `backend` services have health checks; the `frontend` service should show as running.

To follow startup logs:

```sh
docker compose logs -f
```

Press `Ctrl+C` to stop following logs; this does not stop the application.

## Stop or restart

Stop and remove the containers while keeping the PostgreSQL data:

```sh
docker compose down
```

Start the existing installation again:

```sh
docker compose up -d
```

To rebuild after changing application code:

```sh
docker compose up --build -d
```

The database is stored in a named Docker volume and is preserved by `docker compose down`. **Do not use `docker compose down -v` unless you intend to permanently delete the database.**

## Access from another computer

The frontend is published on port `8080` by default. From another computer, open `http://<linux-machine-ip>:8080`; allow inbound TCP port 8080 in the machine's firewall if needed. To use another port, change `FORKITY_PORT` in `.env` and recreate the frontend:

```sh
docker compose up -d --force-recreate frontend
```

## Optional: local development

For development with hot reload, install Node.js 22 or newer, npm, and Docker Compose. From the repository root:

```sh
cp .env.example .env
sed -i "s/^POSTGRES_PASSWORD=.*/POSTGRES_PASSWORD=$(openssl rand -hex 32)/" .env
docker compose up -d db
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173). The frontend and backend run locally, while PostgreSQL runs in Docker. Press `Ctrl+C` to stop the development servers; stop PostgreSQL with `docker compose down` when finished.