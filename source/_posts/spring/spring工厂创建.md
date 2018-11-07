---
title: spring工厂创建
date: 2018-09-20 11:11:03
tags:
- spring 
categories:
- spring

---

# spring工厂创建

<bean id="clientService"
​    class="examples.ClientService"
​    factory-method="createInstance"/>
public class ClientService {
​    private static ClientService clientService = new ClientService();
​    private ClientService() {}

    public static ClientService createInstance() {
        return clientService;
    }
}
<!-- the factory bean, which contains a method called createInstance() -->
<bean id="serviceLocator" class="examples.DefaultServiceLocator">
​    <!-- inject any dependencies required by this locator bean -->
</bean>

<!-- the bean to be created via the factory bean -->
<bean id="clientService"
​    factory-bean="serviceLocator"
​    factory-method="createClientServiceInstance"/>
public class DefaultServiceLocator {

    private static ClientService clientService = new ClientServiceImpl();
    
    public ClientService createClientServiceInstance() {
        return clientService;
    }
}

一个factory-bean可以有多个factory-method
<bean id="serviceLocator" class="examples.DefaultServiceLocator">
​    <!-- inject any dependencies required by this locator bean -->
</bean>

<bean id="clientService"
​    factory-bean="serviceLocator"
​    factory-method="createClientServiceInstance"/>

<bean id="accountService"
​    factory-bean="serviceLocator"
​    factory-method="createAccountServiceInstance"/>
public class DefaultServiceLocator {

    private static ClientService clientService = new ClientServiceImpl();
    
    private static AccountService accountService = new AccountServiceImpl();
    
    public ClientService createClientServiceInstance() {
        return clientService;
    }
    
    public AccountService createAccountServiceInstance() {
        return accountService;
    }
}    


In Spring documentation, factory bean refers to a bean that is configured in the Spring container that will create objects through an 
instance or static factory method. By contrast, FactoryBean (notice the capitalization) refers to a Spring-specific FactoryBean.