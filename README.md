# 🤖 AI Web Content Extractor

> Extract clean, structured content from websites for AI agents and LLMs. Includes MCP server for direct AI integration.

[![Apify Actor](https://img.shields.io/badge/Apify-Actor-blue)](https://apify.com)
[![MCP Compatible](https://img.shields.io/badge/MCP-Compatible-green)](https://modelcontextprotocol.io)

## 🌟 Features

- **🧹 Clean Extraction**: Removes ads, navigation, and noise
- **📝 Multiple Formats**: Markdown, Text, HTML, Structured JSON
- **🔗 Link & Image Extraction**: Get all references from pages
- **📊 Table & Code Extraction**: Preserve structured content
- **🔌 MCP Server**: Direct integration with AI agents
- **📦 Chunking Support**: Split content for LLM token limits
- **🌐 Multi-page Crawling**: Follow links and extract entire sites

## 🚀 Quick Start

### Basic Usage

```json
{
    "urls": ["https://example.com/article"],
    "outputFormat": "markdown"
}

┌─────────────────────────────────────────────────────────────────┐
│                      USER FEATURES                               │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  🔐 AUTHENTICATION           🛍️ SHOPPING                        │
│  ├── Google OAuth Login      ├── Browse Products                │
│  ├── Manual Registration     ├── Search & Filter                │
│  ├── Email Verification      ├── Product Details                │
│  ├── Password Reset          ├── Add to Cart                    │
│  └── Profile Management      ├── Wishlist                       │
│                              ├── Apply Coupons                  │
│  📦 ORDERS                   └── Checkout                       │
│  ├── Place Orders                                               │
│  ├── Order History           💳 PAYMENTS                        │
│  ├── Track Orders            ├── Razorpay                       │
│  ├── Cancel Orders           ├── Stripe                         │
│  ├── Return Requests         ├── Cash on Delivery               │
│  └── Download Invoices       └── Wallet                         │
│                                                                  │
│  ⭐ REVIEWS                   📍 ADDRESS                         │
│  ├── Write Reviews           ├── Multiple Addresses             │
│  ├── Rate Products           ├── Default Address                │
│  └── View Reviews            └── Address Validation             │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘


┌─────────────────────────────────────────────────────────────────┐
│                      ADMIN FEATURES                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  📊 DASHBOARD                 📦 PRODUCT MANAGEMENT            │
│  ├── Sales Analytics         ├── Add/Edit/Delete Products       │
│  ├── Revenue Charts          ├── Bulk Upload                    │
│  ├── Order Statistics        ├── Inventory Management           │
│  └── User Statistics         ├── Category Management            │
│                              └── Brand Management               │
│  👥 USER MANAGEMENT                                             │
│  ├── View All Users          🎫 COUPON MANAGEMENT               │
│  ├── Block/Unblock Users     ├── Create Coupons                 │
│  └── User Details            ├── Set Validity                   │
│                              └── Usage Limits                   │
│  📋 ORDER MANAGEMENT                                            │
│  ├── View All Orders         📈 REPORTS                         │
│  ├── Update Order Status     ├── Sales Report                   │
│  ├── Process Returns         ├── Product Report                 │
│  └── Manage Refunds          └── Export to PDF/Excel            │
│                                                                 │
│  🖼️ BANNER MANAGEMENT        📧 NOTIFICATIONS                  │
│  ├── Home Banners            ├── Email Notifications            │
│  ├── Offer Banners           ├── Order Updates                  │
│  └── Category Banners        └── Promotional Emails             │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘