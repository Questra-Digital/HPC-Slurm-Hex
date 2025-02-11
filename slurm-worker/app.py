from flask import Flask, request, jsonify
from flask_cors import CORS
import os
import subprocess
import shutil

app = Flask(__name__)
CORS(app)  # Enable CORS for the entire application

@app.route('/submit-job', methods=['POST'])
def submit_job():
    # Parse JSON payload
    data = request.json
    job_id = data.get('Job_id')
    job_name = data.get('Job_name')
    github_url = data.get('github_url')
    user_name = data.get('user_name')

    # Validate required parameters
    if not all([job_id, job_name, github_url, user_name]):
        return jsonify({"error": "Missing required parameters"}), 400

    try:
        # Navigate to home directory and then jobs directory
        home_dir = os.path.expanduser("~")
        jobs_dir = os.path.join(home_dir, "jobs")
        os.makedirs(jobs_dir, exist_ok=True)
        
        # Create a folder with Job_id as name
        job_folder = os.path.join(jobs_dir, job_id)
        os.makedirs(job_folder, exist_ok=True)
        
        # Clone the GitHub repository into the folder
        subprocess.run(["git", "clone", github_url, job_folder], check=True)
        
        # Navigate into the cloned repository
        os.chdir(job_folder)

        # Execute "sbatch run.sh --comment=user_name --job-name=job_name"
        command = ["sbatch", "--job-name", job_name, f"--comment={user_name}", "run.sh"]
        subprocess.run(command, check=True)

        return jsonify({"message": f"Job '{job_name}' submitted successfully!", "job_id": job_id}), 200

    except subprocess.CalledProcessError as e:
        return jsonify({"error": f"Command failed: {e}"}), 500
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route('/zip-job', methods=['POST'])
def zip_job():
    # Parse JSON payload
    data = request.json
    job_id = data.get('Job_id')

    # Validate required parameter
    if not job_id:
        return jsonify({"error": "Missing job_id parameter"}), 400

    try:
        # Navigate to home directory and then jobs directory
        home_dir = os.path.expanduser("~")
        jobs_dir = os.path.join(home_dir, "jobs")
        
        # Check if the folder with the job_id exists
        job_folder = os.path.join(jobs_dir, job_id)
        if not os.path.exists(job_folder):
            return jsonify({"message": "Job folder not found"}), 404
        
        # Define the ZIP file name
        zip_filename = f"{job_id}.zip"
        
        # Change directory to jobs folder to ensure relative paths
        os.chdir(jobs_dir)
        
        # Use the zip command to zip the folder
        result = subprocess.run(
            ["zip", "-r", zip_filename, job_id],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE
        )
        
        # Check if the zip command executed successfully
        if result.returncode != 0:
            return jsonify({"error": result.stderr.decode('utf-8')}), 500
        
        return jsonify({"message": f"Job folder '{job_id}' successfully zipped!", "zip_file": zip_filename}), 200

    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/cancel-job', methods=['POST'])
def cancel_job():
    # Parse JSON payload
    data = request.json
    job_id = data.get('Job_id')

    # Validate required parameter
    if not job_id:
        return jsonify({"error": "Missing job_id parameter"}), 400

    try:
        # Execute the scancel command to cancel the job
        result = subprocess.run(
            ["scancel", job_id],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE
        )
        
        # Check if the scancel command executed successfully
        if result.returncode == 0:
            return jsonify({"message": f"Job '{job_id}' canceled successfully!"}), 200
        else:
            error_message = result.stderr.decode('utf-8')
            return jsonify({"error": f"Failed to cancel job '{job_id}'.", "details": error_message}), 500

    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/health-check', methods=['GET'])
def health_check():
    return jsonify({"status": "healthy"}), 200


if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5003)
