#!/usr/bin/env bash
# MAGIC HS - installazione su un server Linux tuo (per esempio un Cloud VPS Aruba).
# Sistemi: Ubuntu 22.04 / 24.04 o Debian 12 / 13. Servono almeno 2 GB di RAM.
#
#   curl -fsSL https://raw.githubusercontent.com/ShakeMyMids/magic-hs/main/server/installa.sh -o installa.sh
#   sudo bash installa.sh
#
# Cosa fa: installa Docker, firewall (solo SSH, 80 e 443), protezione dai tentativi di accesso SSH,
# aggiornamenti di sicurezza automatici, memoria di scorta (swap) sui server piccoli; scarica MAGIC HS
# in /opt/magic-hs, lo configura e lo avvia con HTTPS automatico (Caddy + Let's Encrypt).
# Si puo' rilanciare quando vuoi: aggiorna codice e configurazione senza toccare utenti e dati.
#
# Opzioni:
#   --solo-sito   non tocca il sistema (pacchetti, firewall, swap): installa solo il sito. Docker deve esserci gia'.
#   --si          nessuna domanda: usa le variabili DOMINIO, GEMINI_API_KEY, EMAIL_INVIO, EMAIL_PASSWORD
#                 (e facoltative SMTP_HOST, SMTP_PORTA, SMTP_SICUREZZA).
set -Eeuo pipefail

REPO="${MAGIC_HS_REPO:-https://github.com/ShakeMyMids/magic-hs.git}"
RAMO="${MAGIC_HS_RAMO:-main}"
CARTELLA="${MAGIC_HS_CARTELLA:-/opt/magic-hs}"
UID_SITO=10001                       # utente con cui gira il sito dentro il container (vedi Dockerfile)

SOLO_SITO=0
DOMANDE=1
for a in "$@"; do
  case "$a" in
    --solo-sito) SOLO_SITO=1 ;;
    --si) DOMANDE=0 ;;
    -h|--help|--aiuto) sed -n '2,17p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "Opzione sconosciuta: $a (vedi --aiuto)"; exit 2 ;;
  esac
done
[ -r /dev/tty ] || DOMANDE=0

# ------------------------------------------------------------------ messaggi
if [ -t 1 ]; then G=$'\e[1m'; V=$'\e[32m'; GI=$'\e[33m'; R=$'\e[31m'; N=$'\e[0m'; else G=""; V=""; GI=""; R=""; N=""; fi
passo()  { printf '\n%s==> %s%s\n' "$G" "$*" "$N"; }
ok()     { printf '%s    ok:%s %s\n' "$V" "$N" "$*"; }
avviso() { printf '%s    attenzione:%s %s\n' "$GI" "$N" "$*"; }
muori()  { printf '\n%sERRORE:%s %s\n' "$R" "$N" "$*" >&2; exit 1; }
trap 'muori "comando non riuscito alla riga $LINENO. Correggi il problema e rilancia lo script: riparte da dove serve."' ERR

chiedi() {          # chiedi VARIABILE "domanda" [predefinito] [segreta]
  local __var=$1 __domanda=$2 __pred=${3:-} __segreta=${4:-} __r=""
  if [ "$DOMANDE" = 1 ]; then
    if [ -n "$__pred" ]; then __domanda="$__domanda [$__pred]"; fi
    if [ -n "$__segreta" ]; then
      read -r -s -p "    $__domanda: " __r < /dev/tty || true; echo
    else
      read -r -p "    $__domanda: " __r < /dev/tty || true
    fi
  fi
  printf -v "$__var" '%s' "${__r:-$__pred}"
}

# ------------------------------------------------------------------ controlli
controlla_sistema() {
  passo "Controllo il server"
  [ "$(id -u)" = 0 ] || muori "lancia lo script come amministratore: sudo bash installa.sh"
  [ -r /etc/os-release ] || muori "sistema non riconosciuto (serve Ubuntu o Debian)"
  # shellcheck disable=SC1091
  . /etc/os-release
  OS_ID=${ID:-}
  OS_CODICE=${UBUNTU_CODENAME:-${VERSION_CODENAME:-}}
  if [ "$SOLO_SITO" = 0 ]; then
    case "$OS_ID" in
      ubuntu|debian) ok "$PRETTY_NAME" ;;
      *) muori "questo script installa il sistema solo su Ubuntu o Debian (trovato: ${PRETTY_NAME:-?}). Con Docker gia' installato puoi usare --solo-sito." ;;
    esac
  fi
  local ram_mb
  ram_mb=$(awk '/MemTotal/ {print int($2/1024)}' /proc/meminfo)
  RAM_MB=$ram_mb
  if [ "$ram_mb" -lt 1700 ]; then
    avviso "il server ha ${ram_mb} MB di RAM: l'aggiornamento mensile dei dati ne usa circa 520. Aggiungo memoria di scorta (swap), ma e' consigliato un piano da 2 GB."
  else
    ok "RAM: ${ram_mb} MB"
  fi
}

# ------------------------------------------------------------------ domande
valido_dominio() { [[ "$1" =~ ^([a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,63}$ ]]; }

chiedi_configurazione() {
  passo "Configurazione"
  local dominio_attuale=""
  if [ -f "$CARTELLA/.env" ]; then dominio_attuale=$(sed -n 's/^TARIC_DOMINIO=//p' "$CARTELLA/.env" | tr -d "'\"" || true); fi
  if [ "$DOMANDE" = 1 ]; then
    echo "    Indirizzo del sito: un dominio o sottodominio che punta all'IP di questo server"
    echo "    (record A nel pannello DNS del dominio), per esempio magichs.it o taric.miaazienda.it."
  fi
  DOMINIO=${DOMINIO:-$dominio_attuale}
  while :; do
    chiedi DOMINIO "Dominio" "$DOMINIO"
    DOMINIO=$(printf '%s' "$DOMINIO" | tr '[:upper:]' '[:lower:]' | sed -e 's#^https\?://##' -e 's#/.*$##')
    if valido_dominio "$DOMINIO"; then break; fi
    [ "$DOMANDE" = 1 ] || muori "indica un dominio valido, per esempio DOMINIO=magichs.it"
    echo "    Non sembra un dominio valido: scrivilo senza https:// (es. magichs.it)."
    DOMINIO=""
  done
  ok "sito: https://$DOMINIO"

  if [ "$DOMANDE" = 1 ]; then
    echo
    echo "    Chiave di Google Gemini per la classificazione con l'IA (da aistudio.google.com)."
    echo "    Invio per saltare: la puoi aggiungere dopo con «magic-hs configura»."
  fi
  GEMINI_API_KEY=${GEMINI_API_KEY:-}
  chiedi GEMINI_API_KEY "Chiave Gemini (non viene mostrata)" "" segreta
  GEMINI_API_KEY=$(printf '%s' "$GEMINI_API_KEY" | tr -d '[:space:]')

  if [ "$DOMANDE" = 1 ]; then
    echo
    echo "    Casella email da cui il sito manda conferme di registrazione e password dimenticate."
    echo "    Con una casella Aruba del tuo dominio basta indirizzo e password. Invio per saltare:"
    echo "    senza email ogni registrazione aspetta la tua approvazione nel pannello Gestione."
  fi
  EMAIL_INVIO=${EMAIL_INVIO:-}
  EMAIL_PASSWORD=${EMAIL_PASSWORD:-}
  chiedi EMAIL_INVIO "Indirizzo email del sito" "$EMAIL_INVIO"
  EMAIL_INVIO=$(printf '%s' "$EMAIL_INVIO" | tr -d '[:space:]')
  if [ -n "$EMAIL_INVIO" ]; then
    [[ "$EMAIL_INVIO" == *@*.* ]] || muori "indirizzo email non valido: $EMAIL_INVIO"
    while :; do
      chiedi EMAIL_PASSWORD "Password della casella (non viene mostrata)" "" segreta
      if [[ "$EMAIL_PASSWORD" == *"'"* ]]; then
        [ "$DOMANDE" = 1 ] || muori "la password della casella non puo' contenere l'apostrofo (')"
        echo "    La password contiene un apostrofo ('), che il file di configurazione non accetta: cambiala sulla casella o usa un'altra casella."
        continue
      fi
      [ -n "$EMAIL_PASSWORD" ] && break
      [ "$DOMANDE" = 1 ] || muori "manca EMAIL_PASSWORD"
    done
    SMTP_HOST=${SMTP_HOST:-smtps.aruba.it}
    SMTP_PORTA=${SMTP_PORTA:-465}
    SMTP_SICUREZZA=${SMTP_SICUREZZA:-ssl}
    if [ "$DOMANDE" = 1 ]; then
      chiedi SMTP_HOST "Server di posta in uscita (Aruba: smtps.aruba.it)" "$SMTP_HOST"
      chiedi SMTP_PORTA "Porta" "$SMTP_PORTA"
      chiedi SMTP_SICUREZZA "Sicurezza: ssl (porta 465) o starttls (porta 587)" "$SMTP_SICUREZZA"
    fi
    ok "posta: $EMAIL_INVIO tramite $SMTP_HOST:$SMTP_PORTA"
  fi
}

# ------------------------------------------------------------------ sistema
apt_installa() { DEBIAN_FRONTEND=noninteractive apt-get install -y -q --no-install-recommends "$@" >/dev/null; }

installa_pacchetti() {
  passo "Pacchetti di sistema"
  DEBIAN_FRONTEND=noninteractive apt-get update -q >/dev/null
  apt_installa ca-certificates curl git ufw fail2ban python3-systemd unattended-upgrades cron
  ok "curl, git, ufw, fail2ban, aggiornamenti automatici"
}

installa_docker() {
  passo "Docker"
  if command -v docker >/dev/null && docker compose version >/dev/null 2>&1; then
    ok "gia' installato ($(docker --version | sed 's/,.*//'))"
  else
    install -m 0755 -d /etc/apt/keyrings
    curl -fsSL "https://download.docker.com/linux/$OS_ID/gpg" -o /etc/apt/keyrings/docker.asc
    chmod a+r /etc/apt/keyrings/docker.asc
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/$OS_ID $OS_CODICE stable" \
      > /etc/apt/sources.list.d/docker.list
    DEBIAN_FRONTEND=noninteractive apt-get update -q >/dev/null
    apt_installa docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
    ok "installato ($(docker --version | sed 's/,.*//'))"
  fi
  systemctl enable --now docker >/dev/null 2>&1 || true
}

prepara_swap() {
  passo "Memoria di scorta (swap)"
  if [ "$(awk '/SwapTotal/ {print $2}' /proc/meminfo)" -gt 0 ]; then
    ok "gia' presente"
    return
  fi
  if [ "$RAM_MB" -ge 3000 ]; then
    ok "non serve (RAM sufficiente)"
    return
  fi
  if ! { fallocate -l 2G /swapfile 2>/dev/null || dd if=/dev/zero of=/swapfile bs=1M count=2048 status=none; }; then
    rm -f /swapfile
    avviso "non riesco a creare /swapfile: continuo senza"
    return
  fi
  chmod 600 /swapfile
  mkswap /swapfile >/dev/null
  if swapon /swapfile 2>/dev/null; then
    grep -q '^/swapfile ' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
    echo 'vm.swappiness=10' > /etc/sysctl.d/99-magic-hs.conf
    sysctl -q -p /etc/sysctl.d/99-magic-hs.conf || true
    ok "2 GB in /swapfile"
  else
    rm -f /swapfile
    avviso "questo server non permette lo swap: continuo senza"
  fi
}

porte_ssh() {
  {
    echo 22
    if [ -n "${SSH_CONNECTION:-}" ]; then echo "${SSH_CONNECTION##* }"; fi
    sshd -T 2>/dev/null | awk '$1 == "port" {print $2}' || true
  } | grep -E '^[0-9]+$' | sort -un
}

prepara_firewall() {
  passo "Firewall"
  local p
  ufw default deny incoming >/dev/null
  ufw default allow outgoing >/dev/null
  for p in $(porte_ssh); do ufw allow "$p/tcp" comment 'SSH' >/dev/null; done
  ufw allow 80/tcp comment 'MAGIC HS http' >/dev/null
  ufw allow 443/tcp comment 'MAGIC HS https' >/dev/null
  ufw allow 443/udp comment 'MAGIC HS http/3' >/dev/null
  ufw --force enable >/dev/null
  ok "aperte solo SSH ($(porte_ssh | paste -sd, -)), 80 e 443"

  mkdir -p /etc/fail2ban/jail.d
  cat > /etc/fail2ban/jail.d/magic-hs.local <<'EOF'
# MAGIC HS: blocca per un'ora gli indirizzi che sbagliano l'accesso SSH 5 volte in 10 minuti
[sshd]
enabled  = true
backend  = systemd
maxretry = 5
findtime = 10m
bantime  = 1h
EOF
  if systemctl enable --now fail2ban >/dev/null 2>&1 && systemctl restart fail2ban >/dev/null 2>&1; then
    ok "fail2ban attivo sugli accessi SSH"
  else
    avviso "fail2ban non si avvia (controlla con: journalctl -u fail2ban); continuo"
  fi
}

aggiornamenti_automatici() {
  passo "Aggiornamenti di sicurezza automatici"
  cat > /etc/apt/apt.conf.d/20auto-upgrades <<'EOF'
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
APT::Periodic::AutocleanInterval "7";
EOF
  systemctl enable --now unattended-upgrades >/dev/null 2>&1 || true
  ok "attivi (ogni giorno)"
}

# ------------------------------------------------------------------ sito
scarica_codice() {
  passo "Codice di MAGIC HS"
  if [ -d "$CARTELLA/.git" ]; then
    git -C "$CARTELLA" fetch -q origin "$RAMO"
    git -C "$CARTELLA" checkout -q "$RAMO"
    git -C "$CARTELLA" merge -q --ff-only "origin/$RAMO" || muori "in $CARTELLA ci sono modifiche locali: sistemale (git -C $CARTELLA status) e rilancia"
    ok "aggiornato in $CARTELLA ($(git -C "$CARTELLA" log -1 --format='%h %cs'))"
  elif [ -f "$CARTELLA/docker-compose.yml" ]; then
    ok "uso la copia gia' presente in $CARTELLA (non e' un clone git: non la aggiorno)"
  else
    git clone -q --branch "$RAMO" "$REPO" "$CARTELLA" || muori "non riesco a scaricare $REPO (il repository e' pubblico?)"
    ok "scaricato in $CARTELLA"
  fi
}

imposta() {         # imposta FILE CHIAVE VALORE: sostituisce la riga (anche commentata) o la aggiunge
  local f=$1
  K="$2" VAL="$3" awk '
    BEGIN { k = ENVIRON["K"]; v = ENVIRON["VAL"]; fatto = 0 }
    $0 ~ ("^#?[ \t]*" k "=") { if (!fatto) { print k "=\047" v "\047"; fatto = 1 }; next }
    { print }
    END { if (!fatto) print k "=\047" v "\047" }' "$f" > "$f.nuovo"
  cat "$f.nuovo" > "$f"
  rm -f "$f.nuovo"
}

scrivi_configurazione() {
  passo "File di configurazione"
  cd "$CARTELLA"
  umask 077
  # .env: lo legge docker compose (dominio per Caddy e profilo https)
  printf "# scritto da server/installa.sh\nTARIC_DOMINIO=%s\nCOMPOSE_PROFILES=https\n" "$DOMINIO" > .env
  # taric.env: configurazione del sito (chiavi e password: resta solo su questo server)
  if [ ! -f taric.env ]; then
    cp taric.env.esempio taric.env
    ok "creato taric.env"
  fi
  imposta taric.env TARIC_URL_PUBBLICO "https://$DOMINIO"
  if [ -n "$GEMINI_API_KEY" ]; then imposta taric.env GEMINI_API_KEY "$GEMINI_API_KEY"; fi
  if [ -n "$EMAIL_INVIO" ]; then
    imposta taric.env TARIC_SMTP_HOST "$SMTP_HOST"
    imposta taric.env TARIC_SMTP_PORTA "$SMTP_PORTA"
    imposta taric.env TARIC_SMTP_SICUREZZA "$SMTP_SICUREZZA"
    imposta taric.env TARIC_SMTP_UTENTE "$EMAIL_INVIO"
    imposta taric.env TARIC_SMTP_PASSWORD "$EMAIL_PASSWORD"
    imposta taric.env TARIC_SMTP_MITTENTE "MAGIC HS <$EMAIL_INVIO>"
  fi
  chmod 600 taric.env .env
  umask 022
  mkdir -p dati
  chown "$UID_SITO:$UID_SITO" dati
  chmod 750 dati
  ok "taric.env e .env in $CARTELLA (solo amministratore)"

  chmod +x server/magic-hs
  ln -sf "$CARTELLA/server/magic-hs" /usr/local/bin/magic-hs
  ok "comando «magic-hs» disponibile (magic-hs aiuto)"
}

avvia_sito() {
  passo "Avvio del sito (la prima volta ci vogliono alcuni minuti)"
  cd "$CARTELLA"
  docker compose build --pull -q taric
  docker compose up -d --remove-orphans
  docker image prune -f >/dev/null 2>&1 || true
  for _ in $(seq 1 90); do
    if curl -fsS -o /dev/null --max-time 3 http://127.0.0.1:8000/api/stato; then
      ok "MAGIC HS risponde"
      return
    fi
    sleep 2
  done
  muori "il sito non risponde dopo 3 minuti. Guarda il registro con: magic-hs log"
}

controlla_https() {
  passo "Dominio e certificato HTTPS"
  local ip_dns ip_server
  ip_dns=$(getent ahostsv4 "$DOMINIO" 2>/dev/null | awk 'NR == 1 {print $1}' || true)
  ip_server=$(curl -4 -fsS --max-time 5 https://api.ipify.org 2>/dev/null || true)
  if [ -z "$ip_dns" ]; then
    local verso="l'IP di questo server"
    if [ -n "$ip_server" ]; then verso=$ip_server; fi
    avviso "$DOMINIO non punta ancora a nessun indirizzo. Nel pannello DNS del dominio crea un record A verso $verso: il certificato arrivera' da solo pochi minuti dopo."
    return
  fi
  if [ -n "$ip_server" ] && [ "$ip_dns" != "$ip_server" ]; then
    avviso "$DOMINIO punta a $ip_dns, ma questo server e' $ip_server. Correggi il record A nel pannello DNS: il certificato arrivera' da solo."
    return
  fi
  for _ in $(seq 1 30); do
    if curl -fsS -o /dev/null --max-time 5 "https://$DOMINIO/api/stato" 2>/dev/null; then
      ok "https://$DOMINIO funziona"
      return
    fi
    sleep 3
  done
  avviso "il certificato HTTPS non e' ancora pronto. Se nel pannello Aruba c'e' un firewall, apri le porte 80 e 443; poi controlla con: magic-hs log caddy"
}

riepilogo() {
  local codice=""
  if [ -f "$CARTELLA/dati/codice-configurazione.txt" ]; then codice=$(tr -d '[:space:]' < "$CARTELLA/dati/codice-configurazione.txt"); fi
  passo "Fatto"
  echo
  if [ -n "$codice" ]; then
    echo "    1. Apri      ${G}https://$DOMINIO/configura${N}"
    echo "    2. Inserisci il codice ${G}$codice${N} e crea il tuo account da amministratore."
    echo "    I dati TARIC si scaricano da soli nei primi minuti (Gestione > Dati TARIC)."
  else
    echo "    Il sito e' su ${G}https://$DOMINIO${N}"
  fi
  echo
  echo "    Comandi utili (sul server):"
  echo "      magic-hs stato        come sta il sito"
  echo "      magic-hs aggiorna     installa l'ultima versione da GitHub"
  echo "      magic-hs configura    cambia chiave IA, posta e altre impostazioni"
  echo "      magic-hs aiuto        tutti gli altri"
  echo
}

controlla_sistema
chiedi_configurazione
if [ "$SOLO_SITO" = 0 ]; then
  installa_pacchetti
  installa_docker
  prepara_swap
  prepara_firewall
  aggiornamenti_automatici
else
  if ! { command -v docker >/dev/null && docker compose version >/dev/null 2>&1; }; then
    muori "con --solo-sito serve Docker con il plugin compose gia' installato"
  fi
fi
command -v git >/dev/null || muori "manca git (apt install git)"
scarica_codice
scrivi_configurazione
avvia_sito
controlla_https
riepilogo
