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

<!--more-->

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
     - -d：后台启动容器并打印容器id
     - --name：指定名称
     - -t：分配一个为终端进行登录
     - -i：容器的标准输入为打开状态
     - -m：指定内存
     - -c：指定cpu占比
     - -w：指定容器内用户的家目录
     - -p: 指定端口映射关系
     - -v: 指定文件目录的映射关系
   - docker run --rm  centos：容器停止后自动删除容器 
   - docker start 容器id：启动容器
   - docker stop 容器id：停止容器
   - docker rm -f 容器id：删除一个正在运行的容器
   - docker ps：查看容器
     - -a：显示所有的容器，包括停止的
     - -q：只列出容器id
   - docker attach 容器id：进入容器
   - docker run -d centos:7 /bin/bash :后台启动，然后使用exec登录docker机器
   - docker exec -it 容器名称：进入容器，再次exit不会停止容器
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

## 镜像制作

- 手动制作

   - docker run --name "mynginx" -it centos：从centos镜像启动一个容器
   - 安装 rmp -ivh https://mirrors.aliyun.com/epel/
   - 安装nginx  yum install -y nginx
   - docker commit -m "my nginx" 2e013dfc32c2 mynginx:v1 ：根据容器id打镜像，指定tag为v1
   - docker images：查看是否有制作成功的 my nginx的镜像
   - docker run -it  mynginx:v1：启动镜像，指定tag为v1,不然默认找latest的，修改nginx的配置文件
   - vim /etc/nginx/nginx.confg：加上 daemon off;前天运行
   - docker commit -m "my nginx" 2e013dfc32c2 mynginx:v2：重新 打镜像，指定tag为v2
   - docker run -d -p 82:80 mynginx:v2 nginx：启动容器并启动nginx

- **DockerFile 构建**

   docker build 镜像:tag /test/dockFile

   - dockerfile组成

      - 基础镜像信息
      - 维护者信息
      - 镜像操作指令
      - 容器启动时执行指令 

   - 语法

      - FROM：构建指令，**必须指定且需要在Dockerfile其他指令的前面**。后续的指令都依赖于该指令指定的image。FROM指令指定的基础image可以是官方远程仓库中的，也可以位于本地仓库

         ```shell
         #如果不指定tag，默认使用latest
         FROM <image>:<tag>  
         ```

      - MAINTAINER：构建指令，用于将image的制作者相关的信息写入到image中。当我们对该image执行docker inspect命令时，输出中有相应的字段记录该信息。

         ```shell
         MAINTAINER <name>
         ```

      - RUN：执行命令

         ```shell
         RUN <command> (the command is run in a shell - `/bin/sh -c`)  
         RUN ["executable", "param1", "param2" ... ]  (exec form)  
         ```

      - CMD：设置镜像启动时执行的指令或脚本，该指令只能在文件中存在一次，如果有多个，执行最后一条

         ```shell
         CMD ["executable","param1","param2"] (like an exec, this is the preferred form)  
         CMD command param1 param2 (as a shell)
         ```

      - ENTRYPOINT：设置container启动时执行的操作，可以多次设置，但是只有最后一个有效

         ```shell
         ENTRYPOINT ["executable", "param1", "param2"] (like an exec, the preferred form)  
         ENTRYPOINT command param1 param2 (as a shell) 
         ```

         - 该指令的使用分为两种情况，一种是独自使用，另一种和CMD指令配合使用。
            当独自使用时，如果你还使用了CMD命令且CMD是一个完整的可执行的命令，那么CMD指令和ENTRYPOINT会互相覆盖只有最后一个CMD或者ENTRYPOINT有效。
            ```shell
            # CMD指令将不会被执行，只有ENTRYPOINT指令被执行  
            CMD echo “Hello, World!”  
            ENTRYPOINT ls -l  
            ```
         - 另一种用法和CMD指令配合使用来指定ENTRYPOINT的默认参数，这时CMD指令不是一个完整的可执行命令，仅仅是参数部分；ENTRYPOINT指令只能使用JSON方式指定执行命令，而不能指定参数。

            ```shell
            FROM ubuntu  
            CMD ["-l"]  
            ENTRYPOINT ["/usr/bin/ls"]  
            ```

      - USER：设置启动容器的用户，默认是root用户。

         ```shell
         # 指定memcached的运行用户  
         ENTRYPOINT ["memcached"]  
         USER daemon  
         或  
         ENTRYPOINT ["memcached", "-u", "daemon"]  
         ```

      - EXPOSE：指定映射端口，该指令会将容器中的端口映射成宿主机器中的某个端口。当你需要访问容器的时候，可以不是用容器的IP地址而是使用宿主机器的IP地址和映射后的端口

         ```shell
         # 映射一个端口  
         EXPOSE port1  
         # 相应的运行容器使用的命令  
         docker run -p port1 image  
         # 映射多个端口  
         EXPOSE port1 port2 port3  
         # 相应的运行容器使用的命令  
         docker run -p port1 -p port2 -p port3 image  
         # 还可以指定需要映射到宿主机器上的某个端口号  
         docker run -p host_port1:port1 -p host_port2:port2 -p host_port3:port3 image  
         ```

      - ENV：在image中设置一个环境变量

         ```shell
         ENV <key> <value>  
         ```

         设置了后，后续的RUN命令都可以使用，container启动后，可以通过docker inspect查看这个环境变量，也可以通过在docker run --env key=value时设置或修改环境变量。
         假如你安装了JAVA程序，需要设置JAVA_HOME，那么可以在Dockerfile中这样写：
         ENV JAVA_HOME /path/to/java/dirent

      - ADD：从src复制文件到container的dest路径

         ```shell
         #<src> 是相对被构建的源目录的相对路径，可以是文件或目录的路径，也可以是一个远程的文件url;
         #<dest> 是container中的绝对路径
         ADD <src> <dest>  
         ```

         所有拷贝到container中的文件和文件夹权限为0755，uid和gid为0；如果是一个目录，那么会将该目录下的所有文件添加到container中，不包括目录；如果文件是可识别的压缩格式，则docker会帮忙解压缩（注意压缩格式）；如果<src>是文件且<dest>中不使用斜杠结束，则会将<dest>视为文件，<src>的内容会写入<dest>；如果<src>是文件且<dest>中使用斜杠结束，则会<src>文件拷贝到<dest>目录下

      - VOLUME：指定挂载点，使容器中的一个目录具有持久化存储数据的功能，该目录可以被容器本身使用，也可以共享给其他容器使用,运行通过该Dockerfile生成image的容器，/tmp/data目录中的数据在容器关闭后，里面的数据还存在

         ```shell
         FROM base  
         VOLUME ["/tmp/data"]  
         ```

      - WORKDIR：切换目录，可以多次切换(相当于cd命令)，对RUN,CMD,ENTRYPOINT生效

         ```shell
         WORKDIR /path/to/workdir
         # 在 /p1/p2 下执行 vim a.txt  
         WORKDIR /p1 WORKDIR p2 RUN vim a.txt  
         ```

      - ONBUILD：在子镜像中执行,构建镜像时并不执行，而是在它的子镜像中执行

         ```shell
         ONBUILD <Dockerfile关键字>  
         ```
