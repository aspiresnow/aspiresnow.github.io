---
title: spring Validation
date: 2018-11-22 17:39:11
tags:
- spring 
categories:
- spring



---

# spring Validation

1. spring完全支持JSR-303 Bean Validation API
2. Spring DataBinder可以在绑定值的时候实现验证
3. spring MVC 对于`@Controller`的参数支持声明式验证

Since Spring 3, a DataBinder instance can be configured with a Validator. Once configured, the Validator may be invoked by calling `binder.validate()`. Any validation Errors are automatically added to the binder’s BindingResult.

```java
Foo target = new Foo();
DataBinder binder = new DataBinder(target);
binder.setValidator(new FooValidator());
// bind to the target object
binder.bind(propertyValues);
// validate the target object
binder.validate();
// get BindingResult that includes any validation errors
BindingResult results = binder.getBindingResult();
```