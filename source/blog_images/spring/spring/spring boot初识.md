---
title: spring-boot初识
date: 2017-10-20 18:18:04
tags:
- spring-boot
categories:
- spring

---

# spring boot初识

## 使用spring boot

- 继承

- 引入

  如果不想继承spring-boot-starter-parent，可以引入spring-boot-dependencies的jar包，指定scope为import。

  ```xml
  <dependencyManagement>
       <dependencies>
         <!-- Override Spring Data release train provided by Spring Boot -->
          <dependency>
              <groupId>org.springframework.data</groupId>
              <artifactId>spring-data-releasetrain</artifactId>
              <version>Fowler-SR2</version>
              <scope>import</scope>
              <type>pom</type>
          </dependency>
          <dependency>
              <!-- Import dependency management from Spring Boot -->
              <groupId>org.springframework.boot</groupId>
              <artifactId>spring-boot-dependencies</artifactId>
              <version>1.5.9.RELEASE</version>
              <type>pom</type>
              <scope>import</scope>
          </dependency>
      </dependencies>
  </dependencyManagement>
  ```


- Spring-boot打包

  ```xml
  <build>
      <plugins>
          <plugin>
              <groupId>org.springframework.boot</groupId>
              <artifactId>spring-boot-maven-plugin</artifactId>
          </plugin>
      </plugins>
  </build>
  ```

- @EnableAutoConfiguration

  -         这里我们只需要关心 @EnableAutoConfiguration 即可。这个注解是让Spring Boot*猜测 *你想怎么配置Spring，但实际上，它是根据你添加到classpath中的依赖来判断的。

- SpringApplication.run(IndexController.class,args);

- @SpringBootApplication

- mvn spring-boot:run

- actuator