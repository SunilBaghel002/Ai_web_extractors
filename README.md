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