# Common Configuration
IMAGE_NAME = "bento/ubuntu-20.04"

Vagrant.configure("2") do |config|
  config.ssh.insert_key = false

  # Define nodes with common configuration
  NODES = [
    { name: "slurm-master", ip: "192.168.56.20", cpus: 2, memory: 4096, ports: [{ guest: 5000, host: 5000 }] },
    { name: "slurm-worker", ip: "192.168.56.21", cpus: 2, memory: 4096 },
    { name: "slurm-worker-2", ip: "192.168.56.22", cpus: 2, memory: 4096 }
  ]

  NODES.each do |node|
    config.vm.define node[:name] do |vm|
      vm.vm.box = IMAGE_NAME
      vm.vm.hostname = node[:name]
      vm.vm.network "private_network", ip: node[:ip]

      vm.vm.provider "virtualbox" do |v|
        v.memory = node[:memory]
        v.cpus = node[:cpus]
      end

      # Configure port forwarding if specified
      if node[:ports]
        node[:ports].each do |port|
          vm.vm.network "forwarded_port", guest: port[:guest], host: port[:host]
        end
      end
    end
  end
end
