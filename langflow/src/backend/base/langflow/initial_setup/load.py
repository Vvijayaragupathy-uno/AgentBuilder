from .starter_projects import (
    aiccore_agent_graph,
)


def get_starter_projects_graphs():
    return [
        aiccore_agent_graph(),
    ]


def get_starter_projects_dump():
    return [g.dump() for g in get_starter_projects_graphs()]
