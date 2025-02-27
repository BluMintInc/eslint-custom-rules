# Warn when using CSS properties that trigger compositing layers, which can impact performance. Properties like transform, opacity, filter, and will-change create new GPU layers. While sometimes beneficial for animations, excessive layer creation can increase memory usage and hurt performance. Consider alternatives or explicitly document intentional layer promotion (`@blumintinc/blumint/no-compositing-layer-props`)

💼 This rule is enabled in the ✅ `recommended` config.

<!-- end auto-generated rule header -->
