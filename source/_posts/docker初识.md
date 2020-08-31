---
title: docker初识
date: 2018-08-04 10:26:48
tags:
- docker
categories:
- docker


---

# docker初识

Docker是Container容器引擎，基于Go语言，基于linux虚拟内核技术，实现隔离，不需要操作系统另外开销。硬件是共享的,容器只能运行与底层宿主机相同或者相似的操作系统。

容器与管理程序虚拟化有所不同，管理程序虚拟化通过中间层将一台或者多台独立的机器虚拟运行与物理硬件之上，而容器则是直接运行在操作系统内核之上的用户空间，容器技术可以让多个独立的用户空间运行在同一台宿主机上。 

Docker核心：构建、运输、运行

Docker组成：服务端、客户端，镜像、容器、 仓库

Docker容器理念是单进程，即一个容器只起一个进程（不太现实感觉）

优点：

- 简化环境配置
- 多版本测试
- 环境配置一致性
- 自动扩容(微服务)

使用国内的ustc镜像会快点，需要修改或创建/etc/docker/daemon.json

```properties
{
  "registry-mirrors": ["http://hub-mirror.c.163.com"]
}
```

## 安装

- centos7下直接使用yum安装，yum install -y docker

- 启动docker

  ```shell
  systemctl start docker &  #启动docker服务
  systemctl enable docker #开机启动
  ```

- 镜像管理

  - docker search  镜像名：搜索镜像
  - docker pull 镜像名:版本号:获取镜像，不指定版本号，默认下载latest
  - docker rmi imageId：删除一个镜像，如果镜像创建了容器则不能删除
  - docker images ：查看docker中的所有镜像，每个镜像都有一个唯一的image id
  - docker save centos > /opt/centos.tar.gz ： 导出镜像
  - docker load < /opt/centos.tar.gz ：导入镜像

- 容器管理

   - docker run centos:7 /bin/bash：启动centos(7为镜像版本)镜像，并执行一条指令

     ```properties
     -d：后台启动容器并打印容器id
     ---name：指定名称
     -t：分配一个为终端进行登录
     -i：容器的标准输入为打开状态
     -m：指定内存
     -c：指定cpu占比
     -w：指定容器内用户的家目录
     -p: 指定端口映射关系
     -v: 指定文件目录的映射关系
     docker run --name redis -d redis redis-server
     ```

   - docker run --rm  centos：容器停止后自动删除容器 

   - docker start 容器id：启动容器

   - docker stop 容器id：停止容器

   - docker rm -f 容器id：删除一个正在运行的容器

   - docker ps：查看容器
     - -a：显示所有的容器，包括停止的
     - -q：只列出容器id

   - docker attach 容器id：进入容器

   - docker run -d centos:7 /bin/bash :后台启动，然后使用exec登录docker机器

   - docker exec -it 容器名称 命令：执行容器中的命令，/bin/bash直接进入容器

     ```
     docker exec -it redis redis-cli
     ```

   - exit: 退出容器，-it模式容器会自动终止，-d模式容器不会终止

   - docker logs 容器id：查看容器id

   - docker inspect 容器id: 查看容器运行的各种数据

   - **nsenter**：根据pid进入容器，使用exit退出后容器不停止
     - 安装 yum install util-linux
     - nsenter -t Pid -u -i -n -p：根据pid登录

- 容器内命令
     - docker cp 需要拷贝的文件或目录 容器名称:容器目录
     - docker cp 容器名称:容器目录 需要拷贝的文件或目录

- 网络访问
     - docker run -P nginx：随机映射端口，容器启动时会随机出个端口映射nginx的80端口
     - docker run -p hostPort:containerPort：使用宿主机端口映射docker机端口
       - -p ip:hostPort:containerPort
       - -p ip::containerPort

- 数据卷

   - docker run -it -v 宿主机目录:容器目录 镜像名：将物理机上的一个目录挂载到容器指定目录
      - 在docker inspect 中看 Mounts底下的source
      - -v src:dst：指定物理机的目录挂载到docker上
        - -v src:dst:rw：指定挂载目录的权限
      - --volumes-from 容器id/名字 ：让一个容器访问另一个容器的卷，达到nfs的效果
      - docker run -it -volumns-from nfs容器id 容器id：启动一个访问nfs的容器
      - 数据卷容器停止之后，其他容器照样能访问数据卷容器上的目录
