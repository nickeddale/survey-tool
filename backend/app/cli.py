import asyncio
import sys
import uuid
from datetime import datetime, timezone

from sqlalchemy import select

from app.config import settings
from app.database import async_session
from app.models.answer_option import AnswerOption
from app.models.question import Question
from app.models.question_group import QuestionGroup
from app.models.response import Response
from app.models.response_answer import ResponseAnswer
from app.models.survey import Survey
from app.models.user import User
from app.services.auth_service import hash_password

NAMESPACE = uuid.NAMESPACE_DNS
SEED_PREFIX = "survey-tool-seed"


def make_id(key: str) -> uuid.UUID:
    return uuid.uuid5(NAMESPACE, f"{SEED_PREFIX}.{key}")


async def _exists(session, model, id_val: uuid.UUID) -> bool:
    result = await session.execute(select(model).where(model.id == id_val))
    return result.scalar_one_or_none() is not None


def _report(label: str, skipped: bool) -> None:
    status = "skipped" if skipped else "created"
    print(f"  [{status}] {label}")


async def seed() -> None:
    if settings.environment not in ("development", "test"):
        print(
            f"Error: seed command is only allowed in development or test environments. "
            f"Current environment: {settings.environment!r}"
        )
        sys.exit(1)

    async with async_session() as session:
        print("Seeding users...")
        creator_id = make_id("user.creator")
        if await _exists(session, User, creator_id):
            _report("creator@dev.local", skipped=True)
        else:
            session.add(User(
                id=creator_id,
                email="creator@dev.local",
                password_hash=hash_password("password123"),
                name="Dev Creator",
                is_active=True,
            ))
            _report("creator@dev.local", skipped=False)

        creator2_id = make_id("user.creator2")
        if await _exists(session, User, creator2_id):
            _report("creator2@dev.local", skipped=True)
        else:
            session.add(User(
                id=creator2_id,
                email="creator2@dev.local",
                password_hash=hash_password("password123"),
                name="Second Creator",
                is_active=True,
            ))
            _report("creator2@dev.local", skipped=False)

        await session.flush()

        print("Seeding surveys...")

        # --- Survey 1: Customer Satisfaction Survey ---
        csat_id = make_id("survey.csat")
        if await _exists(session, Survey, csat_id):
            _report("Customer Satisfaction Survey", skipped=True)
        else:
            session.add(Survey(
                id=csat_id,
                user_id=creator_id,
                title="Customer Satisfaction Survey",
                status="active",
            ))
            _report("Customer Satisfaction Survey", skipped=False)

        # --- Survey 2: Employee Feedback ---
        employee_id = make_id("survey.employee")
        if await _exists(session, Survey, employee_id):
            _report("Employee Feedback", skipped=True)
        else:
            session.add(Survey(
                id=employee_id,
                user_id=creator_id,
                title="Employee Feedback",
                status="draft",
                welcome_message="We value your feedback! Please share your thoughts.",
            ))
            _report("Employee Feedback", skipped=False)

        # --- Survey 3: Product Research 2025 ---
        research_id = make_id("survey.research")
        if await _exists(session, Survey, research_id):
            _report("Product Research 2025", skipped=True)
        else:
            session.add(Survey(
                id=research_id,
                user_id=creator_id,
                title="Product Research 2025",
                status="closed",
            ))
            _report("Product Research 2025", skipped=False)

        # --- Survey 4: Archived Legacy Survey ---
        archived_id = make_id("survey.archived")
        if await _exists(session, Survey, archived_id):
            _report("Archived Legacy Survey", skipped=True)
        else:
            session.add(Survey(
                id=archived_id,
                user_id=creator_id,
                title="Archived Legacy Survey",
                status="archived",
            ))
            _report("Archived Legacy Survey", skipped=False)

        await session.flush()

        print("Seeding question groups...")

        # --- CSAT groups ---
        csat_general_id = make_id("group.csat.general")
        if await _exists(session, QuestionGroup, csat_general_id):
            _report("CSAT: General Feedback", skipped=True)
        else:
            session.add(QuestionGroup(
                id=csat_general_id,
                survey_id=csat_id,
                title="General Feedback",
                sort_order=1,
            ))
            _report("CSAT: General Feedback", skipped=False)

        csat_product_id = make_id("group.csat.product")
        if await _exists(session, QuestionGroup, csat_product_id):
            _report("CSAT: Product Details", skipped=True)
        else:
            session.add(QuestionGroup(
                id=csat_product_id,
                survey_id=csat_id,
                title="Product Details",
                sort_order=2,
            ))
            _report("CSAT: Product Details", skipped=False)

        # --- Employee group ---
        employee_exp_id = make_id("group.employee.exp")
        if await _exists(session, QuestionGroup, employee_exp_id):
            _report("Employee: Your Experience", skipped=True)
        else:
            session.add(QuestionGroup(
                id=employee_exp_id,
                survey_id=employee_id,
                title="Your Experience",
                sort_order=1,
            ))
            _report("Employee: Your Experience", skipped=False)

        # --- Research group ---
        research_market_id = make_id("group.research.market")
        if await _exists(session, QuestionGroup, research_market_id):
            _report("Research: Market Analysis", skipped=True)
        else:
            session.add(QuestionGroup(
                id=research_market_id,
                survey_id=research_id,
                title="Market Analysis",
                sort_order=1,
            ))
            _report("Research: Market Analysis", skipped=False)

        # --- Archived group ---
        archived_legacy_id = make_id("group.archived.legacy")
        if await _exists(session, QuestionGroup, archived_legacy_id):
            _report("Archived: Legacy", skipped=True)
        else:
            session.add(QuestionGroup(
                id=archived_legacy_id,
                survey_id=archived_id,
                title="Legacy",
                sort_order=1,
            ))
            _report("Archived: Legacy", skipped=False)

        await session.flush()

        print("Seeding questions...")

        # --- CSAT General questions ---
        q_csat_name_id = make_id("question.csat.name")
        if await _exists(session, Question, q_csat_name_id):
            _report("CSAT: name", skipped=True)
        else:
            session.add(Question(
                id=q_csat_name_id,
                group_id=csat_general_id,
                question_type="short_text",
                code="name",
                title="What is your name?",
                is_required=True,
                sort_order=1,
            ))
            _report("CSAT: name", skipped=False)

        q_csat_satisfaction_id = make_id("question.csat.satisfaction")
        if await _exists(session, Question, q_csat_satisfaction_id):
            _report("CSAT: satisfaction", skipped=True)
        else:
            session.add(Question(
                id=q_csat_satisfaction_id,
                group_id=csat_general_id,
                question_type="single_choice",
                code="satisfaction",
                title="How satisfied are you with our service?",
                is_required=True,
                sort_order=2,
            ))
            _report("CSAT: satisfaction", skipped=False)

        q_csat_recommend_id = make_id("question.csat.recommend")
        if await _exists(session, Question, q_csat_recommend_id):
            _report("CSAT: recommend", skipped=True)
        else:
            session.add(Question(
                id=q_csat_recommend_id,
                group_id=csat_general_id,
                question_type="rating",
                code="recommend",
                title="How likely are you to recommend us? (1-5)",
                is_required=False,
                sort_order=3,
                settings={"min": 1, "max": 5},
            ))
            _report("CSAT: recommend", skipped=False)

        q_csat_used_before_id = make_id("question.csat.used_before")
        if await _exists(session, Question, q_csat_used_before_id):
            _report("CSAT: used_before", skipped=True)
        else:
            session.add(Question(
                id=q_csat_used_before_id,
                group_id=csat_product_id,
                question_type="yes_no",
                code="used_before",
                title="Have you used our product before?",
                is_required=True,
                sort_order=1,
            ))
            _report("CSAT: used_before", skipped=False)

        q_csat_features_id = make_id("question.csat.features")
        if await _exists(session, Question, q_csat_features_id):
            _report("CSAT: features", skipped=True)
        else:
            session.add(Question(
                id=q_csat_features_id,
                group_id=csat_product_id,
                question_type="multiple_choice",
                code="features",
                title="Which features do you use most?",
                is_required=False,
                sort_order=2,
            ))
            _report("CSAT: features", skipped=False)

        # --- Employee questions ---
        q_emp_department_id = make_id("question.employee.department")
        if await _exists(session, Question, q_emp_department_id):
            _report("Employee: department", skipped=True)
        else:
            session.add(Question(
                id=q_emp_department_id,
                group_id=employee_exp_id,
                question_type="short_text",
                code="department",
                title="What department do you work in?",
                is_required=True,
                sort_order=1,
            ))
            _report("Employee: department", skipped=False)

        q_emp_suggestions_id = make_id("question.employee.suggestions")
        if await _exists(session, Question, q_emp_suggestions_id):
            _report("Employee: suggestions", skipped=True)
        else:
            session.add(Question(
                id=q_emp_suggestions_id,
                group_id=employee_exp_id,
                question_type="long_text",
                code="suggestions",
                title="What improvements would you suggest?",
                is_required=False,
                sort_order=2,
            ))
            _report("Employee: suggestions", skipped=False)

        # --- Research questions ---
        q_research_industry_id = make_id("question.research.industry")
        if await _exists(session, Question, q_research_industry_id):
            _report("Research: industry", skipped=True)
        else:
            session.add(Question(
                id=q_research_industry_id,
                group_id=research_market_id,
                question_type="single_choice",
                code="industry",
                title="What industry are you in?",
                is_required=True,
                sort_order=1,
            ))
            _report("Research: industry", skipped=False)

        q_research_interest_id = make_id("question.research.interest")
        if await _exists(session, Question, q_research_interest_id):
            _report("Research: interest", skipped=True)
        else:
            session.add(Question(
                id=q_research_interest_id,
                group_id=research_market_id,
                question_type="rating",
                code="interest",
                title="Rate your interest in our new product (1-10)",
                is_required=True,
                sort_order=2,
                settings={"min": 1, "max": 10},
            ))
            _report("Research: interest", skipped=False)

        q_research_feedback_id = make_id("question.research.feedback")
        if await _exists(session, Question, q_research_feedback_id):
            _report("Research: feedback", skipped=True)
        else:
            session.add(Question(
                id=q_research_feedback_id,
                group_id=research_market_id,
                question_type="long_text",
                code="feedback",
                title="Any additional feedback?",
                is_required=False,
                sort_order=3,
            ))
            _report("Research: feedback", skipped=False)

        # --- Archived question ---
        q_archived_comment_id = make_id("question.archived.comment")
        if await _exists(session, Question, q_archived_comment_id):
            _report("Archived: comment", skipped=True)
        else:
            session.add(Question(
                id=q_archived_comment_id,
                group_id=archived_legacy_id,
                question_type="short_text",
                code="comment",
                title="Leave a comment",
                is_required=False,
                sort_order=1,
            ))
            _report("Archived: comment", skipped=False)

        await session.flush()

        print("Seeding answer options...")

        satisfaction_options = [
            ("very_satisfied", "Very Satisfied", 1),
            ("satisfied", "Satisfied", 2),
            ("neutral", "Neutral", 3),
            ("dissatisfied", "Dissatisfied", 4),
        ]
        for code, title, sort_order in satisfaction_options:
            opt_id = make_id(f"option.csat.satisfaction.{code}")
            if await _exists(session, AnswerOption, opt_id):
                _report(f"CSAT satisfaction: {code}", skipped=True)
            else:
                session.add(AnswerOption(
                    id=opt_id,
                    question_id=q_csat_satisfaction_id,
                    code=code,
                    title=title,
                    sort_order=sort_order,
                ))
                _report(f"CSAT satisfaction: {code}", skipped=False)

        features_options = [
            ("dashboard", "Dashboard", 1),
            ("reports", "Reports", 2),
            ("api", "API Access", 3),
            ("integrations", "Integrations", 4),
        ]
        for code, title, sort_order in features_options:
            opt_id = make_id(f"option.csat.features.{code}")
            if await _exists(session, AnswerOption, opt_id):
                _report(f"CSAT features: {code}", skipped=True)
            else:
                session.add(AnswerOption(
                    id=opt_id,
                    question_id=q_csat_features_id,
                    code=code,
                    title=title,
                    sort_order=sort_order,
                ))
                _report(f"CSAT features: {code}", skipped=False)

        industry_options = [
            ("tech", "Technology", 1),
            ("finance", "Finance", 2),
            ("healthcare", "Healthcare", 3),
            ("education", "Education", 4),
        ]
        for code, title, sort_order in industry_options:
            opt_id = make_id(f"option.research.industry.{code}")
            if await _exists(session, AnswerOption, opt_id):
                _report(f"Research industry: {code}", skipped=True)
            else:
                session.add(AnswerOption(
                    id=opt_id,
                    question_id=q_research_industry_id,
                    code=code,
                    title=title,
                    sort_order=sort_order,
                ))
                _report(f"Research industry: {code}", skipped=False)

        await session.flush()

        print("Seeding responses...")

        now = datetime.now(timezone.utc)

        # --- CSAT responses ---
        csat_responses = [
            {
                "key": "response.csat.1",
                "answers": {
                    q_csat_name_id: "Alice Smith",
                    q_csat_satisfaction_id: "very_satisfied",
                    q_csat_recommend_id: 5,
                    q_csat_used_before_id: True,
                    q_csat_features_id: ["dashboard", "reports"],
                },
            },
            {
                "key": "response.csat.2",
                "answers": {
                    q_csat_name_id: "Bob Johnson",
                    q_csat_satisfaction_id: "satisfied",
                    q_csat_recommend_id: 4,
                    q_csat_used_before_id: True,
                    q_csat_features_id: ["api"],
                },
            },
            {
                "key": "response.csat.3",
                "answers": {
                    q_csat_name_id: "Carol White",
                    q_csat_satisfaction_id: "neutral",
                    q_csat_recommend_id: 3,
                    q_csat_used_before_id: False,
                    q_csat_features_id: ["dashboard", "integrations"],
                },
            },
        ]

        for resp_data in csat_responses:
            resp_id = make_id(resp_data["key"])
            if await _exists(session, Response, resp_id):
                _report(f"Response {resp_data['key']}", skipped=True)
            else:
                session.add(Response(
                    id=resp_id,
                    survey_id=csat_id,
                    status="complete",
                    completed_at=now,
                ))
                _report(f"Response {resp_data['key']}", skipped=False)

                for question_id, value in resp_data["answers"].items():
                    answer_id = make_id(f"{resp_data['key']}.{question_id}")
                    session.add(ResponseAnswer(
                        id=answer_id,
                        response_id=resp_id,
                        question_id=question_id,
                        value=value,
                    ))

        # --- Research responses ---
        research_responses = [
            {
                "key": "response.research.1",
                "answers": {
                    q_research_industry_id: "tech",
                    q_research_interest_id: 9,
                    q_research_feedback_id: "Looks very promising for our use case.",
                },
            },
            {
                "key": "response.research.2",
                "answers": {
                    q_research_industry_id: "finance",
                    q_research_interest_id: 7,
                    q_research_feedback_id: "Would need better compliance tooling.",
                },
            },
            {
                "key": "response.research.3",
                "answers": {
                    q_research_industry_id: "healthcare",
                    q_research_interest_id: 8,
                    q_research_feedback_id: None,
                },
            },
            {
                "key": "response.research.4",
                "answers": {
                    q_research_industry_id: "education",
                    q_research_interest_id: 6,
                    q_research_feedback_id: "Pricing is a concern for education budgets.",
                },
            },
            {
                "key": "response.research.5",
                "answers": {
                    q_research_industry_id: "tech",
                    q_research_interest_id: 10,
                    q_research_feedback_id: "Excited to see this launch.",
                },
            },
        ]

        for resp_data in research_responses:
            resp_id = make_id(resp_data["key"])
            if await _exists(session, Response, resp_id):
                _report(f"Response {resp_data['key']}", skipped=True)
            else:
                session.add(Response(
                    id=resp_id,
                    survey_id=research_id,
                    status="complete",
                    completed_at=now,
                ))
                _report(f"Response {resp_data['key']}", skipped=False)

                for question_id, value in resp_data["answers"].items():
                    answer_id = make_id(f"{resp_data['key']}.{question_id}")
                    session.add(ResponseAnswer(
                        id=answer_id,
                        response_id=resp_id,
                        question_id=question_id,
                        value=value,
                    ))

        await session.commit()
        print("Done.")


if __name__ == "__main__":
    if len(sys.argv) < 2 or sys.argv[1] != "seed":
        print("Usage: python -m app.cli seed")
        sys.exit(1)
    asyncio.run(seed())
