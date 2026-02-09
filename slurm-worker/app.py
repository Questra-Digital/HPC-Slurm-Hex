from flask import Flask, request, jsonify, send_file
from flask_cors import CORS
import os
import subprocess
import shutil
from apscheduler.schedulers.background import BackgroundScheduler
import requests
import uuid

app = Flask(__name__)
CORS(app) 

# Declare global variables for FTP credentials
FTP_USER = "f228755"
FTP_PASSWORD = "au2255"

HOME_DIR = os.path.expanduser("~")
JOBS_DIR = os.path.join(HOME_DIR, "jobs")

# Function to check if a job is running using scontrol command (no logging)
def is_job_running(job_id):
    """Check if the job is still RUNNING using scontrol command."""
    try:
        result = subprocess.run(
            ["scontrol", "show", "job", str(job_id)],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            check=True
        )
        for line in result.stdout.splitlines():
            if "JobState=" in line:
                job_state = line.split("JobState=")[1].split()[0]
                return job_state == "RUNNING"
    except subprocess.CalledProcessError:
        pass 
    except Exception:
        pass  
    return False

# Background zipping function
def zip_all_jobs():
    """Zip job folders only when they are no longer running."""
    try:
        if not os.path.exists(JOBS_DIR):
            return
        for job_id in os.listdir(JOBS_DIR):
            # Skip non-numeric folders (like 'myenv', '.git', etc.)
            if not job_id.isdigit():
                continue
                
            job_folder = os.path.join(JOBS_DIR, job_id)
            if os.path.isdir(job_folder):
                zip_filepath = os.path.join(JOBS_DIR, job_id)  # shutil adds .zip
                zip_filename = f"{zip_filepath}.zip"
                
                # Check if we have write permission
                if not os.access(JOBS_DIR, os.W_OK):
                    continue
                    
                if is_job_running(job_id):
                    # Skip running jobs silently
                    continue
                if not os.path.exists(zip_filename) or os.path.getmtime(job_folder) > os.path.getmtime(zip_filename):
                    try:
                        # Use Python's built-in shutil instead of external zip command
                        shutil.make_archive(zip_filepath, 'zip', JOBS_DIR, job_id)
                        print(f"Background zipped {job_id}")
                    except PermissionError:
                        # Silently skip permission errors
                        pass
                    except Exception as zip_error:
                        print(f"Failed to zip {job_id}: {zip_error}")
    except Exception as e:
        print(f"Error in background zipping: {e}")

# Start background scheduler
scheduler = BackgroundScheduler()
scheduler.add_job(zip_all_jobs, 'interval', minutes=1) 
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
    user_email = data.get('user_email') 

    if not all([job_id, job_name, github_url, user_name, cpu_request, memory_request, user_email]):
        return jsonify({"error": "Missing required parameters"}), 400

    try:
        os.makedirs(JOBS_DIR, exist_ok=True)
        job_folder = os.path.join(JOBS_DIR, job_id)

        if os.path.exists(job_folder):
            shutil.rmtree(job_folder)

        if github_url.endswith(".zip"):
            random_uuid = str(uuid.uuid4())
            zip_path = os.path.join(JOBS_DIR, f"{random_uuid}.zip")

            if github_url.startswith("ftp://"):
                # Use global FTP credentials
                subprocess.run([
                    "wget", 
                    "--ftp-user", FTP_USER,
                    "--ftp-password", FTP_PASSWORD,
                    github_url, 
                    "-O", zip_path
                ], check=True)
            else:
                subprocess.run(["wget", github_url, "-O", zip_path], check=True)

            os.makedirs(job_folder, exist_ok=True)
            subprocess.run(["unzip", "-q", zip_path, "-d", job_folder], check=True)
            os.remove(zip_path)
        
        else:
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
        if int(gpu_request) > 0:
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

# ==========================================
# Jupyter Notebook Management Endpoints
# ==========================================

import psutil
import signal

# Track running notebook processes: {port: pid}
NOTEBOOK_PROCESSES = {}

@app.route('/notebook/start', methods=['POST'])
def start_notebook():
    """Start a Jupyter notebook server on specified port with per-user directory."""
    data = request.json
    port = data.get('port', 8888)
    token = data.get('token')
    username = data.get('username')  # For per-user directories
    
    if not token:
        return jsonify({"error": "Token required"}), 400
    
    if port in NOTEBOOK_PROCESSES:
        # Check if process is still running
        try:
            os.kill(NOTEBOOK_PROCESSES[port], 0)
            return jsonify({"error": "Port already in use", "pid": NOTEBOOK_PROCESSES[port]}), 400
        except OSError:
            # Process no longer exists, clean up
            del NOTEBOOK_PROCESSES[port]
    
    try:
        # Create per-user directory if username provided, else use shared directory
        if username:
            notebook_dir = os.path.join(HOME_DIR, "notebooks", username)
        else:
            notebook_dir = os.path.join(HOME_DIR, "notebooks", "shared")
        os.makedirs(notebook_dir, exist_ok=True)
        
        # Start Jupyter notebook in background
        cmd = [
            'jupyter', 'notebook',
            '--no-browser',
            f'--port={port}',
            '--ip=0.0.0.0',
            f'--NotebookApp.token={token}',
            '--NotebookApp.allow_origin=*',
            '--NotebookApp.disable_check_xsrf=True',
            f'--notebook-dir={notebook_dir}'
        ]
        
        # Open log files for stdout/stderr
        log_file = os.path.join(notebook_dir, f'jupyter_{port}.log')
        with open(log_file, 'w') as log:
            proc = subprocess.Popen(
                cmd,
                stdout=log,
                stderr=subprocess.STDOUT,
                start_new_session=True,
                cwd=notebook_dir
            )
        
        NOTEBOOK_PROCESSES[port] = proc.pid
        print(f"Started Jupyter notebook on port {port} with PID {proc.pid} for user '{username or 'shared'}'")
        
        return jsonify({
            "message": "Notebook started",
            "pid": proc.pid,
            "port": port,
            "notebook_dir": notebook_dir
        }), 200
        
    except FileNotFoundError:
        return jsonify({"error": "Jupyter not installed. Run: pip install jupyter"}), 500
    except Exception as e:
        print(f"Failed to start notebook: {e}")
        return jsonify({"error": str(e)}), 500


@app.route('/notebook/stop', methods=['POST'])
def stop_notebook():
    """Stop a Jupyter notebook server."""
    data = request.json
    port = data.get('port')
    pid = data.get('pid')
    
    try:
        # Try to kill by PID first
        if pid:
            try:
                os.kill(int(pid), signal.SIGTERM)
                print(f"Stopped notebook with PID {pid}")
            except ProcessLookupError:
                pass  # Process already gone
            except Exception as e:
                print(f"Error killing PID {pid}: {e}")
        
        # Clean up from tracking dict
        if port and port in NOTEBOOK_PROCESSES:
            del NOTEBOOK_PROCESSES[port]
        
        return jsonify({"message": "Notebook stopped"}), 200
        
    except Exception as e:
        print(f"Error stopping notebook: {e}")
        return jsonify({"error": str(e)}), 500


@app.route('/notebook/resources', methods=['GET'])
def get_resources():
    """Get current CPU, memory, and GPU usage for real-time monitoring graphs."""
    try:
        # CPU usage (percentage, non-blocking sample)
        cpu_percent = psutil.cpu_percent(interval=0.5)
        
        # Memory usage
        memory = psutil.virtual_memory()
        memory_used = round(memory.used / (1024**3), 2)  # GB
        memory_total = round(memory.total / (1024**3), 2)  # GB
        memory_percent = memory.percent
        
        result = {
            "cpu": {
                "percent": cpu_percent,
                "cores": psutil.cpu_count()
            },
            "memory": {
                "used_gb": memory_used,
                "total_gb": memory_total,
                "percent": memory_percent
            },
            "gpu": None
        }
        
        # GPU usage (if NVIDIA GPU available)
        try:
            gpu_output = subprocess.check_output([
                'nvidia-smi',
                '--query-gpu=utilization.gpu,memory.used,memory.total,name',
                '--format=csv,noheader,nounits'
            ], stderr=subprocess.DEVNULL).decode().strip()
            
            if gpu_output:
                parts = gpu_output.split(',')
                result["gpu"] = {
                    "percent": float(parts[0].strip()),
                    "memory_used_mb": float(parts[1].strip()),
                    "memory_total_mb": float(parts[2].strip()),
                    "name": parts[3].strip() if len(parts) > 3 else "Unknown GPU"
                }
        except (subprocess.CalledProcessError, FileNotFoundError):
            # No GPU or nvidia-smi not available - gpu stays None
            pass
        except Exception as gpu_error:
            print(f"GPU monitoring error: {gpu_error}")
        
        return jsonify(result), 200
        
    except Exception as e:
        print(f"Resource monitoring error: {e}")
        return jsonify({"error": str(e)}), 500


if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5053)


