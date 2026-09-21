def money(value):
    return str(value)


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
        "current_month": format_month_summary(comparison["current_month"]),
        "previous_month": format_month_summary(comparison["previous_month"]),
        "difference": {k: money(v) for k, v in comparison["difference"].items()},
        "percentage_difference": {k: percent(v) for k, v in comparison["percentage_difference"].items()},
    }
