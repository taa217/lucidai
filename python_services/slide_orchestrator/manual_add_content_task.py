# python_services/slide_orchestrator/manual_add_content_task.py
from shared_memory import memory_table

with memory_table("content_tasks") as db:
    db["test-task-1"] = {
        "status": "pending",
        "objective": "Draft slides",
        "learning_goal": "Test learning goal"
    }
print("Added pending content task.")
