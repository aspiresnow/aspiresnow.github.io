---
title: maven实现环境切换
date: 2018-07-30 11:23:24
tags:
- Maven
categories:
- Maven

---

# maven实现环境切换

在项目开发过程中往往会有多个环境，不同的环境配置会不同，maven提供一种profiles切换和filter来实现在编译的时候根据环境来替换变量的功能

<!--more-->

## 配置过程

1. 在maven的pom.xml中配置各个环境的profiles，在编译打包的时候使用 -Pprod来指定环境

   ```xml
   <profiles>
       <profile>
           <id>dev</id>
           <activation>
               <!--指定为默认-->
               <activeByDefault>true</activeByDefault>
           </activation>
           <properties>
               <profile.id>dev</profile.id>
           </properties>
       </profile>
       <profile>
           <id>beta</id>
           <properties>
               <profile.id>beta</profile.id>
           </properties>
       </profile>
       <profile>
           <id>prod</id>
           <properties>
               <profile.id>prod</profile.id>
           </properties>
       </profile>
   </profiles>
   ```

2. 使用filtering=true指定使用filters中配置的文件中的变量替换

   ```xml
   <build>
       <filters>
   			<!--指定用于参数替换的配置文件-->
   			<filter>${basedir}/config/common.properties</filter>
   			<!--使用profiles中各个环境不同的文件进行参数替换-->
   			<filter>${basedir}/config/env_${profile.id}.properties</filter>
   		</filters>
   
   		<resources>
   		<!--filtering=true开启属性替换，由于默认是false，需要重新指定一下，资源路径还是默认的路径-->
   			<!--可以指定多个resource节点用于指定需要进行参数替换的文件-->
   			<resource>
   				<directory>${basedir}/src/main/resources</directory>
   				<excludes>
   					<!--排除掉不使用maven进行参数替换的文件-->
   					<exclude>expicate.xml</exclude>
   				</excludes>
   				<filtering>true</filtering>
   			</resource>
   		</resources>
   </build>
   ```

   注意:如果filters中配置了多个用于参数替换的文件，如果多个文件中有相同的变量，那么配置在filter靠下的文件中的变量会生效，下面覆盖上面的。

3. 在工程下新建config目录并添加各个环境的配置文件

   `evn_deva.properties`

   ```properties
   profile_test=dev_test
   ```

   `evn_beta.properties`

   ```properties
   profile_test=beta_test
   ```

   `evn_prod.properties`

   ```properties
   profile_test=prod_test
   ```

   `common.properties`

   ```properties
   profile_test=common_test
   ```

4. 在resources目录下的application.properties中使用变量，用于被各环境参数替换

  ```properties
  profile_test=${profile_test}
  # 也可以使用maven pom中定义的变量
  profile.id = ${profile.id}
  ```

5. 在集成spring boot的时候，发现不能使用 ${}，这是因为工程的pom文件继承了 spring-boot-starter-parent,而在spring-boot-starter-parent的pom.xml中定义了

   ```xml
   <!-- delimiter that doesn't clash with Spring ${} placeholders -->
   <resource.delimiter>@</resource.delimiter> 
   ```

   我们可以在自己的pom中重新将 `resource.delimiter` 指定为 `${}`,当然也可以听从建议直接使用 `@变量名@`



