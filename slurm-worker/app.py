from flask import Flask, request, jsonify, send_file
from flask_cors import CORS
import os
import subprocess
import shutil
from apscheduler.schedulers.background import BackgroundScheduler
import requests

app = Flask(__name__)
CORS(app)  # Enable CORS for the entire application

# Directory paths
HOME_DIR = os.path.expanduser("~")
JOBS_DIR = os.path.join(HOME_DIR, "jobs")
MASTER_NODE_URL = "http://192.168.56.20:5000"  # Adjust to your master node's IP

# Function to check if a job is running by querying the master node
def is_job_running(job_id):
    """Check if the job is 'RUNNING' by querying the master node."""
    try:
        response = requests.get(f"{MASTER_NODE_URL}/job-status/{job_id}")
        response.raise_for_status()
        data = response.json()
        return data.get("state") == "RUNNING"
    except requests.RequestException as e:
        print(f"Error checking job status for {job_id}: {e}")
        return False  # Assume not running if query fails

# Background zipping function
def zip_all_jobs():
    """Zip job folders only when they are no longer running."""
    try:
        if not os.path.exists(JOBS_DIR):
            return
        os.chdir(JOBS_DIR)
        for job_id in os.listdir(JOBS_DIR):
            job_folder = os.path.join(JOBS_DIR, job_id)
            if os.path.isdir(job_folder):
                zip_filename = f"{job_id}.zip"
                # Skip zipping if the job is still running
                if is_job_running(job_id):
                    print(f"Skipping {job_id} - still running")
                    continue
                # Re-zip if folder is newer than the zip or zip doesn't exist
                if not os.path.exists(zip_filename) or os.path.getmtime(job_folder) > os.path.getmtime(zip_filename):
                    subprocess.run(
                        ["zip", "-r", zip_filename, job_id],
                        stdout=subprocess.PIPE,
                        stderr=subprocess.PIPE,
                        check=True
                    )
                    print(f"Background zipped {job_id}")
    except Exception as e:
        print(f"Error in background zipping: {e}")

# Start background scheduler
scheduler = BackgroundScheduler()
scheduler.add_job(zip_all_jobs, 'interval', minutes=1)  # Runs every 5 minutes
scheduler.start()

@app.route('/submit-job', methods=['POST'])
def submit_job():
    data = request.json
    job_id = data.get('Job_id')
    job_name = data.get('Job_name')
    github_url = data.get('github_url')
    user_name = data.get('user_name')
    cpu_request = data.get('cpu_request')
    gpu_request = data.get('gpu_request', 0)
    memory_request = data.get('memory_request')
    user_email = data.get('user_email')  # Get the email from payload

    # Updated required parameters check to include user_email
    if not all([job_id, job_name, github_url, user_name, cpu_request, memory_request, user_email]):
        return jsonify({"error": "Missing required parameters"}), 400

    try:
        os.makedirs(JOBS_DIR, exist_ok=True)
        job_folder = os.path.join(JOBS_DIR, job_id)
        
        if os.path.exists(job_folder):
            shutil.rmtree(job_folder)
        
        subprocess.run(["git", "clone", github_url, job_folder], check=True, capture_output=True, text=True)
        os.chdir(job_folder)

        command = [
            "sbatch",
            "--job-name", job_name,
            f"--comment={user_name}",
            "--cpus-per-task", str(cpu_request),
            "--mem", f"{memory_request}G",
            "--mail-user", user_email,          
            "--mail-type", "BEGIN,END,FAIL"
        ]
        if gpu_request > 0:
            command.extend(["--gpus", str(gpu_request)])
        command.append("run.sh")

        sbatch_result = subprocess.run(command, capture_output=True, text=True, check=True)

        return jsonify({
            "message": f"Job '{job_name}' submitted successfully!",
            "job_id": job_id,
            "sbatch_output": sbatch_result.stdout
        }), 200

    except subprocess.CalledProcessError as e:
        return jsonify({"error": "Job submission failed", "details": e.stderr or str(e)}), 500
    except Exception as e:
        return jsonify({"error": "An unexpected error occurred", "details": str(e)}), 500

@app.route('/zip-job', methods=['POST'])
def zip_job():
    data = request.json
    job_id = data.get('Job_id')
    if not job_id:
        return jsonify({"error": "Missing job_id parameter"}), 400

    try:
        job_folder = os.path.join(JOBS_DIR, job_id)
        if not os.path.exists(job_folder):
            return jsonify({"message": "Job folder not found"}), 404
        
        os.chdir(JOBS_DIR)
        zip_filename = f"{job_id}.zip"
        result = subprocess.run(
            ["zip", "-r", zip_filename, job_id],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            check=True
        )
        return jsonify({"message": f"Job folder '{job_id}' zipped!", "zip_file": zip_filename}), 200

    except subprocess.CalledProcessError as e:
        return jsonify({"error": e.stderr.decode('utf-8')}), 500
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/cancel-job', methods=['POST'])
def cancel_job():
    data = request.json
    job_id = data.get('Job_id')
    if not job_id:
        return jsonify({"error": "Missing job_id parameter"}), 400

    try:
        result = subprocess.run(["scancel", job_id], stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        if result.returncode == 0:
            return jsonify({"message": f"Job '{job_id}' canceled successfully!"}), 200
        return jsonify({"error": "Failed to cancel job", "details": result.stderr.decode('utf-8')}), 500
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/download/<job_id>.zip', methods=['GET'])
def download_job(job_id):
    zip_path = os.path.join(JOBS_DIR, f"{job_id}.zip")
    if os.path.exists(zip_path):
        return send_file(zip_path, as_attachment=True)
    return jsonify({"error": "Zip file not found"}), 404

@app.route('/connect', methods=['GET'])
def health_check():
    try:
        ip = subprocess.check_output("hostname -I", shell=True).decode().strip().split(" ")[0] or "Unknown"
        cpu_count = os.cpu_count()
        try:
            gpu_count = int(subprocess.check_output("nvidia-smi --list-gpus | wc -l", shell=True).decode().strip())
        except subprocess.CalledProcessError:
            gpu_count = 0
        total_memory = round(os.sysconf('SC_PAGE_SIZE') * os.sysconf('SC_PHYS_PAGES') / (1024 ** 3), 2)

        return jsonify({
            "status": "active",
            "ip_address": ip,
            "cpu_count": cpu_count,
            "gpu_count": gpu_count,
            "total_memory_gb": total_memory,
        }), 200
    except Exception as e:
        return jsonify({"status": "inactive", "message": "System check failed", "error": str(e)}), 500

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000)
