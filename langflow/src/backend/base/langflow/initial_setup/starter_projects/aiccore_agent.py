from lfx.components.input_output import ChatInput, ChatOutput
from lfx.components.models_and_agents import PromptComponent
from lfx.components.openai.openai_chat_model import OpenAIModelComponent
from lfx.graph import Graph


def aiccore_agent_graph(template: str | None = None):
    if template is None:
        template = """You are the AICCORE Master Agent. Your goal is to help the user design and build high-performance AI agents.

User Request: {user_input}

Guidelines:
1. Provide technical architectural advice.
2. Suggest optimal component configurations.
3. Help with prompt engineering.

Master Agent Response:
"""
    chat_input = ChatInput()
    prompt_component = PromptComponent()
    prompt_component.set(
        template=template,
        user_input=chat_input.message_response,
    )

    openai_component = OpenAIModelComponent()
    openai_component.set(input_value=prompt_component.build_prompt)

    chat_output = ChatOutput()
    chat_output.set(input_value=openai_component.text_response)

    return Graph(start=chat_input, end=chat_output)
