---
title: spring-AOP 注解的封装
date: 2020-07-01
tags:
- spring 
categories:
- spring

---

# spring-AOP 注解的封装

在spring中的AOP中定义了多个类型的AOP注解，不同的注解需要走不同的逻辑，为了避免通过class来判断注解类型，spring使用AspectJAnnotation类对注解进行了封装，建立了从注解到枚举的映射关系

定义AspectJAnnotationType枚举，跟AOP的注解一一对应

```java
protected enum AspectJAnnotationType {
	AtPointcut, AtAround, AtBefore, AtAfter, AtAfterReturning, AtAfterThrowing
}

private static final Class<?>[] ASPECTJ_ANNOTATION_CLASSES = new Class<?>[] {
			Pointcut.class, Around.class, Before.class, After.class, AfterReturning.class, AfterThrowing.class};
```

定义AspectJAnnotation封装注解到枚举的映射关系。所有的的枚举隐式继承Annotation类。

1. 封装一个Map，静态配置好注解到枚举的映射关系
2. AspectJAnnotation的构造器接收一个注解类
3. 使用注解类作为key从map中获取对应枚举类型

```java
protected static class AspectJAnnotation<A extends Annotation> {

	private static final String[] EXPRESSION_ATTRIBUTES = new String[] {"pointcut", "value"};

	private static Map<Class<?>, AspectJAnnotationType> annotationTypeMap = new HashMap<>(8);

	static {
		annotationTypeMap.put(Pointcut.class, AspectJAnnotationType.AtPointcut);
		annotationTypeMap.put(Around.class, AspectJAnnotationType.AtAround);
		annotationTypeMap.put(Before.class, AspectJAnnotationType.AtBefore);
		annotationTypeMap.put(After.class, AspectJAnnotationType.AtAfter);
		annotationTypeMap.put(AfterReturning.class, AspectJAnnotationType.AtAfterReturning);
		annotationTypeMap.put(AfterThrowing.class, AspectJAnnotationType.AtAfterThrowing);
	}

	private final A annotation;

	private final AspectJAnnotationType annotationType;

	private final String pointcutExpression;

	private final String argumentNames;

	public AspectJAnnotation(A annotation) {
		this.annotation = annotation;
		this.annotationType = determineAnnotationType(annotation);
		try {
			this.pointcutExpression = resolveExpression(annotation);
			Object argNames = AnnotationUtils.getValue(annotation, "argNames");
			this.argumentNames = (argNames instanceof String ? (String) argNames : "");
		}
		catch (Exception ex) {
			throw new IllegalArgumentException(annotation + " is not a valid AspectJ annotation", ex);
		}
	}

	private AspectJAnnotationType determineAnnotationType(A annotation) {
		AspectJAnnotationType type = annotationTypeMap.get(annotation.annotationType());
		if (type != null) {
			return type;
		}
		throw new IllegalStateException("Unknown annotation type: " + annotation);
	}

	private String resolveExpression(A annotation) {
		for (String attributeName : EXPRESSION_ATTRIBUTES) {
			Object val = AnnotationUtils.getValue(annotation, attributeName);
			if (val instanceof String) {
				String str = (String) val;
				if (!str.isEmpty()) {
					return str;
				}
			}
		}
		throw new IllegalStateException("Failed to resolve expression: " + annotation);
	}

	public AspectJAnnotationType getAnnotationType() {
		return this.annotationType;
	}

	public A getAnnotation() {
		return this.annotation;
	}

	public String getPointcutExpression() {
		return this.pointcutExpression;
	}

	public String getArgumentNames() {
		return this.argumentNames;
	}

	@Override
	public String toString() {
		return this.annotation.toString();
	}
}
```


使用的时候，获取方法上配置的注解类型

```java
private static final Class<?>[] ASPECTJ_ANNOTATION_CLASSES = new Class<?>[] {
			Pointcut.class, Around.class, Before.class, After.class, AfterReturning.class, AfterThrowing.class};

protected static AspectJAnnotation<?> findAspectJAnnotationOnMethod(Method method) {
		for (Class<?> clazz : ASPECTJ_ANNOTATION_CLASSES) {
			AspectJAnnotation<?> foundAnnotation = findAnnotation(method, (Class<Annotation>) clazz);
			if (foundAnnotation != null) {
				return foundAnnotation;
			}
		}
		return null;
}
```

将获取到的注解类型，封装为AspectJAnnotation，建立枚举到注解的关系

```java
private static <A extends Annotation> AspectJAnnotation<A> findAnnotation(Method method, Class<A> toLookFor) {
  //获取到 注解类型
		A result = AnnotationUtils.findAnnotation(method, toLookFor);
		if (result != null) {
			return new AspectJAnnotation<>(result);
		} else {
			return null;
		}
}
```

建立完注解到枚举的映射关系后，可以通过aspectJAnnotation获取对应的枚举，只需要通过判断枚举可以实现不同注解不同处理的逻辑

```java
switch (aspectJAnnotation.getAnnotationType()) {
	case AtPointcut:
		return null;
	case AtAround:
		springAdvice = new AspectJAroundAdvice(
				candidateAdviceMethod, expressionPointcut, aspectInstanceFactory);
		break;
	case AtBefore:
		springAdvice = new AspectJMethodBeforeAdvice(
				candidateAdviceMethod, expressionPointcut, aspectInstanceFactory);
		break;
	//此处省略代码
	default:
		throw new UnsupportedOperationException(
				"Unsupported advice type on method: " + candidateAdviceMethod);
}
```

