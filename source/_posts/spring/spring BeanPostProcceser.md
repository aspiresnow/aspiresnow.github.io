---
title: spring BeanPostProcceser
date: 2018-09-20 11:11:03
tags:
- spring 
categories:
- spring

---

# spring BeanPostProcceser

```java
try {
​        // Give BeanPostProcessors a chance to return a proxy instead of the target bean instance.
​        Object bean = resolveBeforeInstantiation(beanName, mbdToUse);
​        if (bean != null) {
​            return bean;
​        }
​    }
protected Object resolveBeforeInstantiation(String beanName, RootBeanDefinition mbd) {
​    Object bean = null;
​    if (!Boolean.FALSE.equals(mbd.beforeInstantiationResolved)) {
​        // Make sure bean class is actually resolved at this point.
​        if (!mbd.isSynthetic() && hasInstantiationAwareBeanPostProcessors()) {
​            Class<?> targetType = determineTargetType(beanName, mbd);
​            if (targetType != null) {
​                bean = applyBeanPostProcessorsBeforeInstantiation(targetType, beanName);
​                if (bean != null) {
​                    bean = applyBeanPostProcessorsAfterInitialization(bean, beanName);
​                }
​            }
​        }
​        mbd.beforeInstantiationResolved = (bean != null);
​    }
​    return bean;
}


protected void applyMergedBeanDefinitionPostProcessors(RootBeanDefinition mbd, Class<?> beanType, String beanName) {
​    for (BeanPostProcessor bp : getBeanPostProcessors()) {
​        if (bp instanceof MergedBeanDefinitionPostProcessor) {
​            MergedBeanDefinitionPostProcessor bdp = (MergedBeanDefinitionPostProcessor) bp;
​            bdp.postProcessMergedBeanDefinition(mbd, beanType, beanName);
​        }
​    }
}

@Override
public Object applyBeanPostProcessorsBeforeInitialization(Object existingBean, String beanName)
​        throws BeansException {

    Object result = existingBean;
    for (BeanPostProcessor processor : getBeanPostProcessors()) {
        result = processor.postProcessBeforeInitialization(result, beanName);
        if (result == null) {
            return result;
        }
    }
    return result;
}

@Override
public Object applyBeanPostProcessorsAfterInitialization(Object existingBean, String beanName)
​        throws BeansException {

    Object result = existingBean;
    for (BeanPostProcessor processor : getBeanPostProcessors()) {
        result = processor.postProcessAfterInitialization(result, beanName);
        if (result == null) {
            return result;
        }
    }
    return result;
}

if (!mbd.isSynthetic() && hasInstantiationAwareBeanPostProcessors()) {
​    for (BeanPostProcessor bp : getBeanPostProcessors()) {
​        if (bp instanceof InstantiationAwareBeanPostProcessor) {
​            InstantiationAwareBeanPostProcessor ibp = (InstantiationAwareBeanPostProcessor) bp;
​            if (!ibp.postProcessAfterInstantiation(bw.getWrappedInstance(), beanName)) {
​                continueWithPropertyPopulation = false;
​                break;
​            }
​        }
​    }
}
```