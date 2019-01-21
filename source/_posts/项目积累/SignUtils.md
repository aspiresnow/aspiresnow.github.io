---
title: SignUtils
date: 2019-01-20 19:15:30
tags:
- utils
categories:
- 项目积累
---

# SignUtils

用于签名验签

逻辑就是对javaBean或者map中的内容，根据属性或者key进行排序，然后转换成string，对其进行hmac签名，通常用于对https接口的内容进行签名验证

例如支付接口，对参数进行签名，将签名后的字符串放到header中传递给被调方，被调方对接收到参数进行同样逻辑的签名，然后比较header中的签名String与计算出来的签名String是否一致

```java
import com.fasterxml.jackson.annotation.JsonInclude;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.PropertyNamingStrategy;
import com.google.common.base.CaseFormat;
import org.apache.commons.codec.binary.Base64;
import org.apache.commons.collections.MapUtils;
import org.apache.commons.lang.StringUtils;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.beans.BeanInfo;
import java.beans.IntrospectionException;
import java.beans.Introspector;
import java.beans.PropertyDescriptor;
import java.io.IOException;
import java.util.Arrays;
import java.util.Comparator;
import java.util.Map;
import java.util.Random;


/**
 * 签名验证工具类
 * @author lizhi.zhang
 */
public class SignUtils {
    public static final String HEADER_CLIENT_ID = "client_id";
    public static final String HEADER_SIGN_TYPE = "sign_type";
    public static final String HEADER_SIGN = "signature";
    public static final String PARAM_NONCE = "nonce";
    private static ObjectMapper objectMapper = new ObjectMapper().setSerializationInclusion(JsonInclude.Include.NON_NULL).setPropertyNamingStrategy(PropertyNamingStrategy.SNAKE_CASE);
    public static final String SIGN_TYPE_SHA256 = "SHA256";
    public static final String SIGN_TYPE_MD5 = "MD5";
    private static final Logger logger = LoggerFactory.getLogger(SignUtils.class);

    private SignUtils() {
    }

    /**
     * 签名验证
     *
     * @param jsonStr 原始字符串
     * @param key     密钥key
     * @param reqSign 加密后的字符串
     * @return
     */
    public static boolean checkSign(String jsonStr, String key, String reqSign) throws Exception {
        String checkSign = sign(jsonStr, key);
        logger.info("reqSign={}, checkSign={}", reqSign, checkSign);
        return StringUtils.equals(checkSign, reqSign);
    }

    /**
     * 签名（业务数据是字符串）
     *
     * @param jsonStr  业务数据字符串
     * @param key      密钥key
     * @param nonceStr 随机数
     * @return
     */
    public static String sign(String jsonStr, String key, String nonceStr) {
        Map<String, Object> params;
        try {
            params = objectMapper.readValue(jsonStr, new TypeReference<Map<String, Object>>() {
            });
            return HmacSHA256(params, key, nonceStr);
        } catch (IOException e) {
            logger.error("format json to map error", e);
            return null;
        } catch (Exception e) {
            e.printStackTrace();
        }
        return null;
    }

    /**
     * 对实体类进行签名。注意：此实体类对应的Class必须是可见的（public）
     *
     * @param obj   要签名的对象
     * @param key   加salt的密钥
     * @param nonce 随机字符串，如果obj中已包含，则此字段作废
     * @return
     */
    public static String sign(Object obj, String key, String nonce) {
        try {
            String originalStr = sortedText(obj, nonce);
            return sign(originalStr, key);
        } catch (Exception e) {
            logger.error("get sort string error", e);
            return null;
        }
    }

    /**
     * 对字符串进行 HmacSHA256，
     *
     * @param data 原始字符串
     * @param key  secret密钥
     * @return
     */
    public static String sign(String data, String key) throws Exception {
        if (StringUtils.isEmpty(data) || StringUtils.isEmpty(key)) {
            return null;
        }
        Mac sha256_HMAC = Mac.getInstance("HmacSHA256");
        SecretKeySpec secret_key = new SecretKeySpec(key.getBytes("UTF-8"), "HmacSHA256");
        sha256_HMAC.init(secret_key);
        String hash = Base64.encodeBase64String(sha256_HMAC.doFinal(data.getBytes()));
        logger.debug("pre sign text: {}", data);
        logger.debug("signature: {}", hash);

        return hash;
    }

    /**
     * 通过SHA-256对参数进行签名，
     *
     * @param params   要签名的参数
     * @param key      加salt的密钥
     * @param nonceStr 随机数
     * @return
     */
    public static String HmacSHA256(Map<String, Object> params, String key, String nonceStr) throws Exception {
        String data = sortedText(params, nonceStr);
        return sign(data, key);
    }

    /**
     * 排序
     *
     * @param params
     * @param nonceStr
     * @return
     */
    public static String sortedText(Map<String, Object> params, String nonceStr) {
        if (MapUtils.isEmpty(params)) {
            return null;
        }
        if (!params.containsKey(PARAM_NONCE)) {
            params.put(PARAM_NONCE, nonceStr);
        }

        StringBuilder paramsString = new StringBuilder();
        params.keySet().stream().sorted().forEach(k -> {
            String value = String.valueOf(params.get(k));
            if (value == null) {
                return;
            }
            paramsString.append(camelToUnderScore(k)).append("=").append(value).append("&");
        });
        paramsString.deleteCharAt(paramsString.length() - 1);
        return paramsString.toString();
    }

    /**
     * 将实体类进行字段排序，并转换为字符串。注意：此实体类对应的Class必须是可见的（public）
     *
     * @param obj
     * @param nonce 随机字符串，如果obj中已包含，则此字段作废
     * @return
     * @throws IntrospectionException
     * @throws ReflectiveOperationException
     */
    private static String sortedText(Object obj, String nonce) throws IntrospectionException, ReflectiveOperationException, JsonProcessingException {
        BeanInfo beanInfo = Introspector.getBeanInfo(obj.getClass());
        PropertyDescriptor[] descriptors = beanInfo.getPropertyDescriptors();
        Arrays.sort(descriptors, Comparator.comparing(PropertyDescriptor::getName));
        StringBuilder str = new StringBuilder();
        boolean containsNonce = false;
        for (PropertyDescriptor descriptor : descriptors) {

            String name = descriptor.getName();
            //去除getClass方法
            if (name.equalsIgnoreCase("class")) {
                continue;
            }
            if (name.equals(PARAM_NONCE)) {
                containsNonce = true;
            }
            // 添加随机字符串
            if (name.compareTo(PARAM_NONCE) > 0 && !containsNonce && StringUtils.isNotEmpty(nonce)) {
                str.append("nonce=").append(nonce).append("&");
                containsNonce = true;
            }
            Object objValue = descriptor.getReadMethod().invoke(obj);
            if (objValue == null) {
                continue;
            }
            String value = objectMapper.writeValueAsString(objValue);
            if (value.startsWith("\"")) {
                value = value.substring(1, value.length() - 1);
            }
            value = value.replaceAll("\\\\", "");

            if ("".equals(value) || "[]".equals(value) || "{}".equals(value)) {
                continue;
            }
            str.append(camelToUnderScore(name)).append("=").append(value).append("&");
        }
        str.deleteCharAt(str.length() - 1);
        return str.toString();
    }

    /**
     * 驼峰转下划线
     *
     * @param str
     * @return
     */
    private static String camelToUnderScore(String str) {
        return CaseFormat.LOWER_CAMEL.to(CaseFormat.LOWER_UNDERSCORE, str);
    }

    public static Map<String, Object> toUnderScoreMap(Object obj) throws IOException {
        String jsonStr = objectMapper.writeValueAsString(obj);
        return objectMapper.readValue(jsonStr, new TypeReference<Map<String, Object>>() {
        });
    }

    /**
     * 创建32位的随机字符
     * 为了防止拼出来的订单号太长看错位, 保证第一位是英文
     */
    public static String buildRandom() {
        Integer length = 32;
        String chars = "ABDEGHJKMNPQVWXZ";
        String charAndDigit = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
        Random random = new Random();
        StringBuffer sb = new StringBuffer();
        for (int i = 0; i < length; i++) {
            if (i == 0) {
                int number = random.nextInt(chars.length());
                sb.append(chars.charAt(number));
            } else {
                int number = random.nextInt(charAndDigit.length());
                sb.append(charAndDigit.charAt(number));
            }
        }
        return sb.toString();
    }
}
```