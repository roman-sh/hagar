# Docker & Docker Compose Cheatsheet

This file contains the most common commands for managing the Hagar application stack on the production droplet.

---

### 🚀 Deploying & Upgrading

This is the standard workflow for deploying a new version of the application after the GitHub Action has successfully built a new image.

1.  **SSH into the droplet:**
    ```bash
    ssh root@<your_droplet_ip>
    ```

2.  **Navigate to the project directory:**
    ```bash
    cd /root/hagar
    ```

3.  **Update the `docker-compose.yml` file:**
    Manually edit the file to replace `YOUR_COMMIT_HASH_HERE` with the new Git commit hash you want to deploy.

4.  **Apply the Update:**
    ```bash
    # This single command tells Docker Compose to synchronize the running state
    # with your updated docker-compose.yml file. Because you are using a new,
    # unique commit hash for the image tag, Docker will not find the image
    # locally and will automatically pull it before recreating the container.
    docker compose up -d
    ```
    
    ***Note on `pull`***: *You can optionally run `docker compose pull hagar` before this step. This is useful to pre-download the image or to verify that the image tag exists in the registry before modifying the running service.*

---

### 🩺 Logs & Status

| Action                       | Command                               |
| ---------------------------- | ------------------------------------- |
| View live logs               | `docker compose logs -f hagar`        |
| Check status of containers   | `docker compose ps`                   |
| See all running containers   | `docker ps`                           |
| Restart the app container    | `docker compose restart hagar`        |
| Stop the app container       | `docker compose stop hagar`           |
| Stop all services            | `docker compose down`                 |

---

### ♻️ WhatsApp Session Reset (Forcing a New QR Code)

Use this sequence if you need to log in again with WhatsApp.

1.  **Stop the Hagar container:**
    ```bash
    docker compose stop hagar
    ```

2.  **Remove the saved session files:**
    *(Ensure you are in the `/root/hagar` directory)*
    ```bash
    rm -rf .wwebjs_auth .wwebjs_cache
    ```

3.  **Start the container again:**
    ```bash
    docker compose up -d hagar
    ```

4.  **Watch the logs for the new QR code:**
    ```bash
    docker compose logs -f hagar
    ```

---

### 🧹 Cleanup & Maintenance

These commands are useful for freeing up disk space.

| Action                                | Command                           |
| ------------------------------------- | --------------------------------- |
| Remove all stopped containers         | `docker container prune -f`       |
| Remove all unused images              | `docker image prune -af`          |
| Remove all unused volumes             | `docker volume prune -f`          |
| **Remove everything unused (all-in-one)** | `docker system prune -af`         |
| See all local images                  | `docker image ls`                 |
| See all local volumes                 | `docker volume ls`                |

---
