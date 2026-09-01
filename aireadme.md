AI接口对接方案：
接口：http://localhost:8000/docs#/AI%E6%8A%A5%E5%91%8A/generate_ai_run_report_api_ai_report_run_post
req:{
  "scope": "all",
  "time_range": "day",
  "venue_name": "string",
  "zone_name": "string",
  "device_id": 0,
  "device_name": "string"
}
res:{
  "report_id": 0,
  "report_title": "string",
  "report_desc": "string",
  "scope": "string",
  "time_range": "string",
  "report_count": 0,
  "report_count_change": "string",
  "device_count": 0,
  "device_count_subtitle": "string",
  "device_online_rate": "string",
  "analysis_dimension": 0,
  "analysis_dimension_subtitle": "string",
  "report_accuracy": "string",
  "report_accuracy_change": "string",
  "metrics": [
    {
      "value": "string",
      "label": "string"
    }
  ],
  "summary": "string",
  "suggestions": [
    "string"
  ],
  "device_stats": {
    "additionalProp1": {}
  },
  "alarm_stats": {
    "additionalProp1": {}
  },
  "device_categories": [
    {
      "category_name": "string",
      "device_count": 0,
      "online_count": 0,
      "offline_count": 0
    }
  ],
  "alarm_distribution": [
    {
      "category": "string",
      "count": 0,
      "percentage": 0
    }
  ],
  "space_alarm_distribution": [
    {
      "space_name": "string",
      "alarm_count": 0
    }
  ],
  "report_list": [
    {
      "id": 0,
      "title": "string",
      "report_type": "string",
      "scope": "string",
      "created_at": "string",
      "data_volume": "string",
      "status": "string"
    }
  ]
}