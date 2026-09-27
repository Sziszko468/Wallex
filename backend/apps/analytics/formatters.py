def money(value):
    return str(value)


def optional_money(value):
    return None if value is None else str(value)


def percent(value):
    return None if value is None else float(value)


def format_month_summary(summary):
    return {
        "year": summary["year"],
        "month": summary["month"],
        "total_income": money(summary["total_income"]),
        "total_expenses": money(summary["total_expenses"]),
        "balance": money(summary["balance"]),
        "transaction_count": summary["transaction_count"],
    }


def format_top_category(top):
    if top is None:
        return None
    return {
        "category_id": top["category_id"],
        "category_name": top["category_name"],
        "amount": money(top["amount"]),
    }


def format_budget_usage(usage_list):
    return [
        {
            "budget_id": entry["budget_id"],
            "category_id": entry["category_id"],
            "category_name": entry["category_name"],
            "budget_amount": money(entry["budget_amount"]),
            "spent_amount": money(entry["spent_amount"]),
            "remaining_amount": money(entry["remaining_amount"]),
            "usage_percentage": percent(entry["usage_percentage"]),
            "variance_percentage": percent(entry["variance_percentage"]),
            "expected_to_date": money(entry["expected_to_date"]),
            "status": entry["status"],
        }
        for entry in usage_list
    ]


def format_category_breakdown(breakdown):
    return [
        {
            "category_id": entry["category_id"],
            "category_name": entry["category_name"],
            "amount": money(entry["amount"]),
            "percentage": percent(entry["percentage"]),
        }
        for entry in breakdown
    ]


def format_dashboard(dashboard):
    return {
        "year": dashboard["year"],
        "month": dashboard["month"],
        "total_income": money(dashboard["total_income"]),
        "total_expenses": money(dashboard["total_expenses"]),
        "balance": money(dashboard["balance"]),
        "transaction_count": dashboard["transaction_count"],
        "top_spending_category": format_top_category(dashboard["top_spending_category"]),
        "budget_usage": format_budget_usage(dashboard["budget_usage"]),
        "subscriptions": format_subscription_overview(dashboard["subscriptions"]),
    }


def format_subscription_overview(overview):
    return {
        "active_count": overview["active_count"],
        "monthly_total": money(overview["monthly_total"]),
        "yearly_total": money(overview["yearly_total"]),
        "due_this_month": money(overview["due_this_month"]),
        "unconverted_currencies": overview["unconverted_currencies"],
    }


def format_monthly_analytics(months):
    return [
        {
            "month": m["month"],
            "month_name": m["month_name"],
            "income": money(m["income"]),
            "expenses": money(m["expenses"]),
            "balance": money(m["balance"]),
        }
        for m in months
    ]


def format_comparison(comparison):
    return {
        "against": comparison["against"],
        "current_month": format_month_summary(comparison["current_month"]),
        "previous_month": format_month_summary(comparison["previous_month"]),
        "difference": {k: money(v) for k, v in comparison["difference"].items()},
        "percentage_difference": {k: percent(v) for k, v in comparison["percentage_difference"].items()},
        "categories": [
            {
                "category_id": entry["category_id"],
                "category_name": entry["category_name"],
                "current_amount": money(entry["current_amount"]),
                "previous_amount": money(entry["previous_amount"]),
                "change_amount": money(entry["change_amount"]),
                "change_percentage": percent(entry["change_percentage"]),
            }
            for entry in comparison["categories"]
        ],
    }


def format_trends(trends):
    return {
        "year": trends["year"],
        "month": trends["month"],
        "months": [
            {
                "year": entry["year"],
                "month": entry["month"],
                "month_name": entry["month_name"],
                "income": money(entry["income"]),
                "expenses": money(entry["expenses"]),
                "balance": money(entry["balance"]),
                "expenses_change_percentage": percent(entry["expenses_change_percentage"]),
            }
            for entry in trends["months"]
        ],
        "average_monthly_expenses": money(trends["average_monthly_expenses"]),
        "categories": [
            {
                "category_id": entry["category_id"],
                "category_name": entry["category_name"],
                "amounts": [money(amount) for amount in entry["amounts"]],
                "total": money(entry["total"]),
                "average": money(entry["average"]),
                "change_amount": money(entry["change_amount"]),
                "change_percentage": percent(entry["change_percentage"]),
            }
            for entry in trends["categories"]
        ],
    }


def format_merchants(result):
    return {
        "year": result["year"],
        "month": result["month"],
        "total_expenses": money(result["total_expenses"]),
        "merchants": [
            {
                "merchant": entry["merchant"],
                "transaction_count": entry["transaction_count"],
                "total": money(entry["total"]),
                "average": money(entry["average"]),
                "share_percentage": percent(entry["share_percentage"]),
                "previous_total": money(entry["previous_total"]),
                "change_percentage": percent(entry["change_percentage"]),
                "last_date": entry["last_date"].isoformat(),
            }
            for entry in result["merchants"]
        ],
    }


def format_spending_patterns(result):
    return {
        "year": result["year"],
        "month": result["month"],
        "days_counted": result["days_counted"],
        "total_expenses": money(result["total_expenses"]),
        "average_daily_spending": optional_money(result["average_daily_spending"]),
        "weekdays": [
            {
                "weekday": entry["weekday"],
                "name": entry["name"],
                "total": money(entry["total"]),
                "transaction_count": entry["transaction_count"],
                "days": entry["days"],
                "average_per_day": optional_money(entry["average_per_day"]),
            }
            for entry in result["weekdays"]
        ],
        "fixed_expenses": money(result["fixed_expenses"]),
        "variable_expenses": money(result["variable_expenses"]),
        "fixed_percentage": percent(result["fixed_percentage"]),
        "recurring_commitments": money(result["recurring_commitments"]),
    }


def format_insights(insights):
    return [
        {
            "id": insight.id,
            "type": insight.type.value,
            "severity": insight.severity.value,
            "message": insight.message,
            "category_id": insight.category_id,
            "amount": None if insight.amount is None else money(insight.amount),
            "percentage": percent(insight.percentage),
        }
        for insight in insights
    ]
