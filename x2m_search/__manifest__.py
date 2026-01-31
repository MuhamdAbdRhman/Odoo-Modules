# -*- coding: utf-8 -*-
{
    'name': 'X2M Search',
    'version': '1.0.0',
    'sequence': 10,
    'category': 'Tools',
    'summary': 'Add search, filter, and group by functionality to O2M and M2M tree views',
    'description': """
X2M Search
==========
This module adds search, filter, and group by functionality to One2Many (O2M) 
and Many2Many (M2M) tree views embedded in form views.

Features:
---------
* Real-time search/filtering in embedded tree views
* Search input with clear button
* Filter and Group By buttons (placeholders for future enhancement)
* Automatic detection of O2M/M2M tree views
* Works with all existing tree views without XML modifications
    """,
    'author': 'Muhamed Abd El-Rhman',
    'website': 'https://www.linkedin.com/in/muhamdabdrhman/',
    'depends': [
        'base',
        'web',
    ],
    'data': [],
    'assets': {
        'web.assets_backend': [
            'x2m_search/static/src/**/*',
        ],
    },
    'installable': True,
    'application': False,
    'auto_install': False,
    'license': 'OPL-1',
    'price': 30.0,
    'currency': 'USD',
    'support': 'muhamed.inbox@gmail.com',
}
