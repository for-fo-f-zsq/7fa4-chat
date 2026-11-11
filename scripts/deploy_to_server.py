import os
import tarfile
import paramiko
import time

HOST = "211.137.101.118"
PORT = 8022
USER = "jxoi"
PASSWORD = "kwquGk@t%DGeLZup6AGdx=RQTBG=~cB+"
DEST_DIR = "/home/jxoi/7fa4-chat-site"

print("1. Creating tarball of updated site and web app...")
tar_path = "site-3.8.3.tar.gz"
with tarfile.open(tar_path, "w:gz") as tar:
    tar.add("site/server.js", arcname="server.js")
    tar.add("site/feedback.js", arcname="feedback.js")
    tar.add("CHANGELOG", arcname="CHANGELOG")
    for root, dirs, files in os.walk("site/public"):
        # Skip qqface to save ~37MB of redundant transfers
        if "qqface" in root.replace("\\", "/"):
            continue
        for f in files:
            full = os.path.join(root, f)
            rel = os.path.relpath(full, "site")
            tar.add(full, arcname=rel.replace("\\", "/"))

size_mb = os.path.getsize(tar_path) / (1024 * 1024)
print(f"Tarball created: {size_mb:.2f} MB")

print("2. Connecting to jxoi via paramiko...")
cli = paramiko.SSHClient()
cli.set_missing_host_key_policy(paramiko.AutoAddPolicy())
cli.connect(HOST, port=PORT, username=USER, password=PASSWORD, timeout=30, allow_agent=False, look_for_keys=False)

try:
    print("3. Uploading tarball...")
    sftp = cli.open_sftp()
    remote_tar = "/tmp/site-3.8.3.tar.gz"
    sftp.put(tar_path, remote_tar)
    sftp.close()
    print("Upload complete.")

    print("4. Extracting and deploying files on jxoi...")
    cmd_extract = f"""
    tar -xzf {remote_tar} -C {DEST_DIR}/
    rm -f {remote_tar}
    ls -la {DEST_DIR}/
    echo "--- public/web/assets"
    ls -lt {DEST_DIR}/public/web/assets | head -n 10
    """
    _, out, err = cli.exec_command(cmd_extract, timeout=60)
    print("Extract output:\n", out.read().decode("utf-8", "replace"))
    e = err.read().decode("utf-8", "replace")
    if e:
        print("Extract stderr:", e)

    print("5. Restarting 7fa4-chat-site.service...")
    sudo_restart = f"echo '{PASSWORD}' | sudo -S systemctl restart 7fa4-chat-site"
    _, out, err = cli.exec_command(sudo_restart, timeout=30)
    out.channel.recv_exit_status()
    time.sleep(2)

    print("6. Verifying service status & healthz...")
    _, out, _ = cli.exec_command("systemctl status 7fa4-chat-site | head -n 15; curl -s http://127.0.0.1:5300/healthz", timeout=30)
    print(out.read().decode("utf-8", "replace"))

    print("7. Testing public access from server...")
    _, out, _ = cli.exec_command("curl -s -m 10 https://jx.7fa4.cn:8888/7fa4-chat/ | grep -i '3.8.3' | head -n 5", timeout=30)
    print("Website 3.8.3 matches:", out.read().decode("utf-8", "replace").strip())

    _, out, _ = cli.exec_command("curl -s -m 10 https://jx.7fa4.cn:8888/7fa4-chat/web/ | head -n 12", timeout=30)
    print("Web client HTML:\n", out.read().decode("utf-8", "replace").strip())

finally:
    cli.close()
    if os.path.exists(tar_path):
        os.remove(tar_path)
    if os.path.exists("site-deploy.tar.gz"):
        os.remove("site-deploy.tar.gz")
    if os.path.exists("site-fast.tar.gz"):
        os.remove("site-fast.tar.gz")

print("Deployment finished successfully!")
